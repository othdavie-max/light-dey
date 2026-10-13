// POST /api/report: the only way a report enters the database.
// Order of checks: signed-in person -> valid input -> bot check -> rate limits -> save -> recompute status -> sessions -> points.
import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { appConfig } from "../../../../config/app.config";
import { adminClient } from "@/lib/supabase/admin";
import { verifyTurnstile } from "@/lib/turnstile";
import { evaluateReportAttempt } from "@/lib/ratelimit";
import { computeStatus, isConfirmation } from "@/lib/status/compute";
import { planSessionUpdate } from "@/lib/status/sessions";
import { reporterTrust } from "@/lib/status/trust";
import { applyReport } from "@/lib/rewards";
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
  let body: { spotId?: string; status?: string; turnstileToken?: string };
  try { body = await req.json(); } catch { return fail(400, "bad_request"); }
  const { spotId, status } = body;
  if (!spotId || !UUID.test(spotId) || !STATUSES.includes(status as ReportStatus)) return fail(400, "bad_request");
  const reported = status as ReportStatus;

  // 3. Is it a person? (Cloudflare Turnstile, invisible)
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || null;
  if (!(await verifyTurnstile(body.turnstileToken, ip))) return fail(403, "bot_check_failed");

  // 4. Does the spot exist, and is this person allowed?
  const [{ data: spot }, { data: profile }] = await Promise.all([
    db.from("spots").select("id,status_flag").eq("id", spotId).maybeSingle(),
    db.from("profiles").select("trust_score,is_banned,points,streak_current,streak_best,last_report_day").eq("id", user.id).maybeSingle(),
  ]);
  if (!spot || spot.status_flag === "rejected") return fail(404, "spot_not_found");
  if (!profile) return fail(401, "no_profile");
  if (profile.is_banned) return fail(403, "banned");

  // 5. Device record (only a hash of the phone's random id is stored) and rate limits.
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
    lastReportAtForSpot: lastMine.data ? new Date(lastMine.data.created_at) : null,
    userHits, deviceHits, ipHits,
  });
  if (!limit.allowed) return fail(429, limit.reason ?? "rate_limited", { retryAfterSeconds: limit.retryAfterSeconds });
  await db.from("rate_limit_hits").insert([keys.user, keys.device, keys.ip].map((key) => ({ key })));

  // 6. Current status, then save the report with the weight it carries (trust, boosted if signed in).
  const { data: row } = await db.from("spot_status").select("*").eq("spot_id", spotId).maybeSingle();
  const current = {
    status: (row?.status ?? "unknown") as SpotState,
    since: row?.since ? new Date(row.since) : null,
    lastReportAt: row?.last_report_at ? new Date(row.last_report_at) : null,
  };
  const trust = reporterTrust(profile.trust_score, !user.is_anonymous);
  const confirmation = isConfirmation(current.status, reported);

  const { error: insertError } = await db.from("reports").insert({
    spot_id: spotId, user_id: user.id, device_id: deviceRow?.id ?? null, status: reported,
    is_confirmation: confirmation, weight: trust, ip_hash: ipHash, created_at: now.toISOString(),
  });
  if (insertError) return fail(500, "could_not_save");

  // 7. Recompute the spot's status from everyone's recent reports.
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

  await db.from("spot_status").upsert({
    spot_id: spotId,
    status: computed.status,
    confidence: computed.confidence,
    since: changed ? now.toISOString() : (current.since?.toISOString() ?? now.toISOString()),
    last_report_at: now.toISOString(),
    last_change_at: changed ? now.toISOString() : (row?.last_change_at ?? null),
    recent_reports: computed.reporters,
    updated_at: now.toISOString(),
  });

  // 8. Supply sessions (the source of truth for hours of light).
  const { data: openRow } = await db.from("supply_sessions").select("*").eq("spot_id", spotId).is("ended_at", null).maybeSingle();
  const open: SupplySession | null = openRow && {
    id: openRow.id, status: openRow.status, startedAt: new Date(openRow.started_at),
    endedAt: null, lastConfirmedAt: new Date(openRow.last_confirmed_at),
  };
  // A report that agrees with the open session confirms it even if the overall status is "mixed" for now.
  const plan = planSessionUpdate(open, computed.status === "mixed" || computed.status === "unknown" ? "unknown" : computed.status, now);
  if (plan.type === "confirm" && open?.id) {
    await db.from("supply_sessions").update({ last_confirmed_at: plan.lastConfirmedAt.toISOString() }).eq("id", open.id);
  } else if (plan.type === "open") {
    await db.from("supply_sessions").insert({ spot_id: spotId, status: plan.open.status, started_at: plan.open.startedAt.toISOString(), last_confirmed_at: plan.open.lastConfirmedAt.toISOString() });
  } else if (plan.type === "change" && open?.id) {
    await db.from("supply_sessions").update({ ended_at: plan.endedAt.toISOString() }).eq("id", open.id);
    await db.from("supply_sessions").insert({ spot_id: spotId, status: plan.open.status, started_at: plan.open.startedAt.toISOString(), last_confirmed_at: plan.open.lastConfirmedAt.toISOString() });
  }

  // 9. Points and streak.
  const reward = applyReport(
    { points: profile.points, streakCurrent: profile.streak_current, streakBest: profile.streak_best, lastReportDay: profile.last_report_day },
    { isConfirmation: confirmation, changedStatus: changed && computed.status === reported, now },
  );
  await db.from("profiles").update({
    points: reward.points, streak_current: reward.streakCurrent, streak_best: reward.streakBest, last_report_day: reward.lastReportDay,
  }).eq("id", user.id);

  return NextResponse.json({
    ok: true,
    status: computed.status,
    confidence: computed.confidence,
    since: (changed ? now : current.since ?? now).toISOString(),
    isConfirmation: confirmation,
    pointsAwarded: reward.pointsAwarded,
    points: reward.points,
    streak: reward.streakCurrent,
  });
}
