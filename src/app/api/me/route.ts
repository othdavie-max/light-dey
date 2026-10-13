// /api/me: a person's own data.
//   GET     download everything we hold about them (the "access" and "portability" rights)
//   DELETE  delete their account and data (the "erasure" right)
// Works for anonymous accounts too: no email is needed, only the sign-in the phone already has.
import { NextResponse } from "next/server";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { adminClient } from "@/lib/supabase/admin";

const json = (body: Record<string, unknown>, status = 200, headers: Record<string, string> = {}) =>
  NextResponse.json(body, { status, headers: { "Cache-Control": "no-store", ...headers } });

async function whoIs(req: Request): Promise<{ db: SupabaseClient; user: User } | null> {
  const db = adminClient();
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const { data } = await db.auth.getUser(token);
  return data?.user ? { db, user: data.user } : null;
}

export async function GET(req: Request) {
  const who = await whoIs(req);
  if (!who) return json({ ok: false, error: "not_signed_in" }, 401);
  const { db, user } = who;

  const [profile, saved, follows, badges, reports, devices, added] = await Promise.all([
    db.from("profiles").select("nickname,language,theme,points,streak_current,streak_best,last_report_day,trust_score,consented_at,consent_version,created_at").eq("id", user.id).maybeSingle(),
    db.from("saved_spots").select("label,position,spots(name,areas(name,city))").eq("user_id", user.id),
    db.from("follows").select("alert_on_come,alert_on_go,quiet_enabled,quiet_start,quiet_end,spots(name)").eq("user_id", user.id),
    db.from("user_badges").select("badge_code,earned_at").eq("user_id", user.id),
    db.from("reports").select("status,created_at,is_confirmation,spots(name,areas(name))").eq("user_id", user.id).order("created_at", { ascending: false }).limit(5000),
    db.from("devices").select("id", { count: "exact", head: true }).eq("user_id", user.id),
    db.from("spots").select("name,status_flag,created_at").eq("created_by", user.id),
  ]);

  return json({
    ok: true,
    exportedAt: new Date().toISOString(),
    about: "Everything Light Dey? holds about this account. Scrambled (hashed) device and network codes are not included because they cannot be read back into anything meaningful.",
    account: { id: user.id, isAnonymous: user.is_anonymous ?? false, email: user.email ?? null, ...(profile.data ?? {}) },
    savedSpots: saved.data ?? [],
    follows: follows.data ?? [],
    badges: badges.data ?? [],
    spotsYouAdded: added.data ?? [],
    reports: reports.data ?? [],
    deviceCount: devices.count ?? 0,
  }, 200, { "Content-Disposition": 'attachment; filename="light-dey-my-data.json"' });
}

export async function DELETE(req: Request) {
  const who = await whoIs(req);
  if (!who) return json({ ok: false, error: "not_signed_in" }, 401);
  const { db, user } = who;

  const { data: profile } = await db.from("profiles").select("is_admin").eq("id", user.id).maybeSingle();
  if (profile?.is_admin) return json({ ok: false, error: "admins_must_be_removed_by_another_admin" }, 403);

  // Reports stay in the statistics but are cut loose from the person: the account link goes automatically when the
  // account is deleted, and the scrambled network code is removed here.
  await db.from("reports").update({ ip_hash: null }).eq("user_id", user.id);
  const { error } = await db.auth.admin.deleteUser(user.id);
  if (error) return json({ ok: false, error: "could_not_delete" }, 500);
  return json({ ok: true });
}
