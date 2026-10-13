// POST /api/report: the only way a report enters the database.
// Order of checks: signed-in person -> valid input -> duplicate? -> bot check -> rate limits -> save -> recompute status -> sessions -> points.
//
// Reports made while the phone had no network arrive later, with the time of the tap (reportedAt) and a
// phone-made id (clientId). The id makes retries safe; the time makes the report count as of when it happened.
import { createHash } from "node:crypto";
import { NextResponse, after } from "next/server";
import { appConfig } from "../../../../config/app.config";
import { adminClient } from "@/lib/supabase/admin";
import { verifyTurnstile } from "@/lib/turnstile";
import { evaluateReportAttempt } from "@/lib/ratelimit";
import { computeStatus, isConfirmation } from "@/lib/status/compute";
import { planSessionUpdate } from "@/lib/status/sessions";
import { reporterTrust } from "@/lib/status/trust";
import { resolveReportTime } from "@/lib/status/reportTime";
import { applyReport } from "@/lib/rewards";
import { badgesQualified } from "@/lib/badges";
import { notifyFollowers } from "@/lib/push/send";
import { payReferralBonus } from "@/lib/referralServer";
import type { ReportInput, ReportStatus, SpotState, SupplySession } from "@/lib/status/types";

const STATUSES: ReportStatus[] = ["on", "off", "weak"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const hash = (kind: string, value: string) =>
  createHash("sha256").update(`${process.env.IP_HASH_SALT ?? ""}:${kind}:${value}`).digest("hex");

const fail = (status: number, error: string, extra: Record<string, unknown> = {}) =>
  NextResponse.json({ ok: false, error, ...extra }, { status });

export async function POST(req: Request) {
  const now = new Date();
  const db = adminClient();

  // 1. Who is this? (Everyone, including first-time visitors, has an anonymous Supabase account.)
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return fail(401, "not_signed_in");
  const { data: auth } = await db.auth.getUser(token);
  const user = auth?.user;
  if (!user) return fail(401, "not_signed_in");

  // 2. Valid input?
  let body: { spotId?: string; status?: string; turnstileToken?: string; clientId?: string; reportedAt?: number };
  try { body = await req.json(); } catch { return fail(400, "bad_request"); }
  const { spotId, status, clientId } = body;
  if (!spotId || !UUID.test(spotId) || !STATUSES.includes(status as ReportStatus)) return fail(400, "bad_request");
  if (clientId !== undefined && (typeof clientId !== "string" || !UUID.test(clientId))) return fail(400, "bad_request");
  const reported = status as ReportStatus;

  const when = resolveReportTime(body.reportedAt, now);
  if (!when.ok) return fail(400, when.reason);
  const at = when.at;

  // 3. Already received this exact report? (a retry after a lost reply) Answer "ok" without counting it twice.
  const alreadyThere = async () => {
    if (!clientId) return null;
    const { data: dup } = await db.from("reports").select("id").eq("client_id", clientId).eq("user_id", user.id).maybeSingle();
    if (!dup) return null;
    const { data: st } = await db.from("spot_status").select("status,since").eq("spot_id", spotId).maybeSingle();
    const { data: p } = await db.from("profiles").select("points,streak_current").eq("id", user.id).maybeSingle();
    return NextResponse.json({
      ok: true, duplicate: true, status: st?.status ?? "unknown", since: st?.since ?? now.toISOString(),
      isConfirmation: false, pointsAwarded: 0, points: p?.points ?? 0, streak: p?.streak_current ?? 0,
    });
  };
  const dupResponse = await alreadyThere();
  if (dupResponse) return dupResponse;

  // 4. Is it a person? (Cloudflare Turnstile, invisible)
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || null;
  if (!(await verifyTurnstile(body.turnstileToken, ip))) return fail(403, "bot_check_failed");

  // 5. Does the spot exist, and is this person allowed?
  const [{ data: spot }, { data: profile }] = await Promise.all([
    db.from("spots").select("id,name,status_flag").eq("id", spotId).maybeSingle(),
    db.from("profiles").select("trust_score,is_banned,points,streak_current,streak_best,last_report_day").eq("id", user.id).maybeSingle(),
  ]);
  if (!spot || spot.status_flag === "rejected") return fail(404, "spot_not_found");
  if (!profile) return fail(401, "no_profile");
  if (profile.is_banned) return fail(403, "banned");

  // 6. Device record (only a hash of the phone's random id is stored) and rate limits.
  const rawDevice = req.headers.get("x-device-id") ?? "";
  const deviceHash = hash("device", rawDevice || user.id);
  const ipHash = hash("ip", ip ?? "unknown");
  const keys = { user: `user:${user.id}`, device: `device:${deviceHash}`, ip: `ip:${ipHash}` };
  const longestWindow = Math.max(...Object.values(appConfig.rateLimits).map((r) => r.windowSeconds));
  const since = new Date(now.getTime() - longestWindow * 1000).toISOString();

  const { data: deviceRow } = await db.from("devices")
    .upsert({ user_id: user.id, device_hash: deviceHash, last_seen: now.toISOString() }, { onConflict: "device_hash" })
    .select("id").single();

  const hits = async (key: string) =>
    ((await db.from("rate_limit_hits").select("hit_at").eq("key", key).gt("hit_at", since).limit(500)).data ?? []).map((r) => new Date(r.hit_at));
  const [userHits, deviceHits, ipHits, lastMine] = await Promise.all([
    hits(keys.user), hits(keys.device), hits(keys.ip),
    db.from("reports").select("created_at").eq("spot_id", spotId)
      .or(deviceRow ? `user_id.eq.${user.id},device_id.eq.${deviceRow.id}` : `user_id.eq.${user.id}`)
      .order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const limit = evaluateReportAttempt({
    now,
    eventAt: at,                         // the cooldown is measured from when the report was MADE
    lastReportAtForSpot: lastMine.data ? new Date(lastMine.data.created_at) : null,
    userHits, deviceHits, ipHits,
  });
  if (!limit.allowed) return fail(429, limit.reason ?? "rate_limited", { retryAfterSeconds: limit.retryAfterSeconds });
  await db.from("rate_limit_hits").insert([keys.user, keys.device, keys.ip].map((key) => ({ key })));
  // Housekeeping promised in the Privacy Policy: spam-control records are cleared within about a day.
  // Done now and then (1 report in 50) so it needs no scheduled job.
  if (Math.random() < 0.02) await db.from("rate_limit_hits").delete().lt("hit_at", new Date(now.getTime() - 24 * 3_600_000).toISOString());

  // 7. Current status, then save the report with the weight it carries (trust, boosted if signed in).
  const { data: row } = await db.from("spot_status").select("*").eq("spot_id", spotId).maybeSingle();
  const current = {
    status: (row?.status ?? "unknown") as SpotState,
    since: row?.since ? new Date(row.since) : null,
    lastReportAt: row?.last_report_at ? new Date(row.last_report_at) : null,
  };
  // A report older than the newest one we already have cannot change history: it adds its vote, nothing more.
  const late = current.lastReportAt !== null && at < current.lastReportAt;
  const trust = reporterTrust(profile.trust_score, !user.is_anonymous);
  const confirmation = isConfirmation(current.status, reported);

  const { error: insertError } = await db.from("reports").insert({
    spot_id: spotId, user_id: user.id, device_id: deviceRow?.id ?? null, status: reported,
    is_confirmation: confirmation, weight: trust, ip_hash: ipHash, created_at: at.toISOString(), client_id: clientId ?? null,
  });
  if (insertError) {
    if (insertError.code === "23505") {                       // lost a race with an identical retry
      const again = await alreadyThere();
      if (again) return again;
    }
    return fail(500, "could_not_save");
  }

  // 8. Recompute the spot's status from everyone's recent reports.
  const windowStart = new Date(now.getTime() - appConfig.status.windowHours * 3_600_000).toISOString();
  const { data: recent } = await db.from("reports")
    .select("user_id,device_id,status,created_at,weight")
    .eq("spot_id", spotId).gt("created_at", windowStart).order("created_at", { ascending: false }).limit(300);
  const votes: ReportInput[] = (recent ?? []).map((r) => ({
    status: r.status as ReportStatus,
    createdAt: new Date(r.created_at),
    trust: r.weight ?? 1,
    reporterId: r.user_id ?? r.device_id ?? "unknown",
  }));
  const computed = computeStatus(votes, current, now);
  const changed = computed.status !== current.status;
  const newest = current.lastReportAt && current.lastReportAt > at ? current.lastReportAt : at;

  await db.from("spot_status").upsert({
    spot_id: spotId,
    status: computed.status,
    confidence: computed.confidence,
    since: changed && !late ? at.toISOString() : (current.since?.toISOString() ?? at.toISOString()),
    last_report_at: newest.toISOString(),
    last_change_at: changed && !late ? at.toISOString() : (row?.last_change_at ?? null),
    recent_reports: computed.reporters,
    updated_at: now.toISOString(),
  });

  // Tell the people following this spot (after the reply is sent, so the reporter never waits for it).
  if (changed && !late) {
    const spotName = spot.name ?? "your spot";
    after(() => notifyFollowers({ spotId, spotName, oldStatus: current.status, newStatus: computed.status as SpotState, reporterId: user.id, now }));
  }

  // 9. Supply sessions (the source of truth for hours of light). Late reports never rewrite history.
  if (!late) {
    const { data: openRow } = await db.from("supply_sessions").select("*").eq("spot_id", spotId).is("ended_at", null).maybeSingle();
    const open: SupplySession | null = openRow && {
      id: openRow.id, status: openRow.status, startedAt: new Date(openRow.started_at),
      endedAt: null, lastConfirmedAt: new Date(openRow.last_confirmed_at),
    };
    // A report that agrees with the open session confirms it even if the overall status is "mixed" for now.
    const plan = planSessionUpdate(open, computed.status === "mixed" || computed.status === "unknown" ? "unknown" : computed.status, at);
    if (plan.type === "confirm" && open?.id) {
      await db.from("supply_sessions").update({ last_confirmed_at: plan.lastConfirmedAt.toISOString() }).eq("id", open.id);
    } else if (plan.type === "open") {
      await db.from("supply_sessions").insert({ spot_id: spotId, status: plan.open.status, started_at: plan.open.startedAt.toISOString(), last_confirmed_at: plan.open.lastConfirmedAt.toISOString() });
    } else if (plan.type === "change" && open?.id) {
      await db.from("supply_sessions").update({ ended_at: plan.endedAt.toISOString() }).eq("id", open.id);
      await db.from("supply_sessions").insert({ spot_id: spotId, status: plan.open.status, started_at: plan.open.startedAt.toISOString(), last_confirmed_at: plan.open.lastConfirmedAt.toISOString() });
    }
  }

  // 10. Points and streak (counted on the day the person actually reported).
  const reward = applyReport(
    { points: profile.points, streakCurrent: profile.streak_current, streakBest: profile.streak_best, lastReportDay: profile.last_report_day },
    { isConfirmation: confirmation, changedStatus: changed && !late && computed.status === reported, now: at },
  );
  await db.from("profiles").update({
    points: reward.points, streak_current: reward.streakCurrent, streak_best: reward.streakBest, last_report_day: reward.lastReportDay,
  }).eq("id", user.id);

  // Invited by a friend? The first report pays both of them a bonus.
  const referral = await payReferralBonus(db, user.id);

  // 11. Badges. Never allowed to fail the report itself.
  let newBadges: string[] = [];
  try {
    const [on, changes, held, me] = await Promise.all([
      db.from("reports").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("status", "on"),
      db.from("reports").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("is_confirmation", false),
      db.from("user_badges").select("badge_code").eq("user_id", user.id),
      db.from("profiles").select("created_at").eq("id", user.id).maybeSingle(),
    ]);
    const joined = me.data?.created_at;
    const rank = joined ? ((await db.from("profiles").select("id", { count: "exact", head: true }).lte("created_at", joined)).count ?? 0) : 0;
    const have = new Set((held.data ?? []).map((x) => x.badge_code));
    newBadges = badgesQualified({
      streakCurrent: reward.streakCurrent, onReports: on.count ?? 0, changeReports: changes.count ?? 0,
      lastReport: { status: reported, at }, joinRank: rank,
    }).filter((c) => !have.has(c));
    if (newBadges.length) await db.from("user_badges").upsert(newBadges.map((badge_code) => ({ user_id: user.id, badge_code })), { onConflict: "user_id,badge_code", ignoreDuplicates: true });
  } catch { newBadges = []; }

  return NextResponse.json({
    ok: true,
    newBadges,
    status: computed.status,
    confidence: computed.confidence,
    since: ((changed && !late ? at : current.since) ?? at).toISOString(),
    isConfirmation: confirmation,
    delayed: when.delayed,
    pointsAwarded: reward.pointsAwarded,
    points: reward.points + referral.bonus,
    referralBonus: referral.bonus,
    streak: reward.streakCurrent,
  });
}
