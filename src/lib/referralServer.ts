// SERVER ONLY. Invite links: record who invited whom, and pay the bonus after the friend's first report.
import type { SupabaseClient } from "@supabase/supabase-js";
import { appConfig } from "../../config/app.config";

export type ClaimResult = "ok" | "already" | "self" | "unknown_code" | "not_new" | "bad_code";

const CODE = /^[0-9a-f]{8}$/i;

/** The invited person opened the app through a friend's link. Only brand-new people (no report yet) can be invited. */
export async function claimReferral(db: SupabaseClient, userId: string, code: string, spotId?: string | null): Promise<ClaimResult> {
  if (!CODE.test(code)) return "bad_code";
  const { data: referrer } = await db.from("profiles").select("id").eq("referral_code", code.toLowerCase()).maybeSingle();
  if (!referrer) return "unknown_code";
  if (referrer.id === userId) return "self";
  const { data: existing } = await db.from("referrals").select("id").eq("referred_id", userId).maybeSingle();
  if (existing) return "already";
  const { count } = await db.from("reports").select("id", { count: "exact", head: true }).eq("user_id", userId);
  if ((count ?? 0) > 0) return "not_new";
  const { error } = await db.from("referrals").insert({ referrer_id: referrer.id, referred_id: userId, spot_id: spotId ?? null });
  if (error) return error.code === "23505" ? "already" : "unknown_code";
  await db.from("profiles").update({ referred_by: referrer.id }).eq("id", userId);
  return "ok";
}

/**
 * Called after someone's report is saved. If they were invited and this is their first report, both people
 * get the bonus (the inviter only up to a limit, so invite farming does not pay). Never throws.
 */
export async function payReferralBonus(db: SupabaseClient, userId: string): Promise<{ bonus: number }> {
  try {
    const { data: ref } = await db.from("referrals").select("id,referrer_id,rewarded").eq("referred_id", userId).maybeSingle();
    if (!ref || ref.rewarded) return { bonus: 0 };
    const { count: made } = await db.from("reports").select("id", { count: "exact", head: true }).eq("user_id", userId);
    if ((made ?? 0) !== 1) return { bonus: 0 };                                   // only the very first report triggers it
    const { count: paid } = await db.from("referrals").select("id", { count: "exact", head: true }).eq("referrer_id", ref.referrer_id).eq("rewarded", true);
    const inviterGets = (paid ?? 0) < appConfig.points.referralMaxRewarded;
    const bonus = appConfig.points.referralBonus;
    await db.from("referrals").update({ rewarded: true }).eq("id", ref.id);
    const add = async (id: string) => {
      const { data: p } = await db.from("profiles").select("points").eq("id", id).maybeSingle();
      if (p) await db.from("profiles").update({ points: p.points + bonus }).eq("id", id);
    };
    await add(userId);
    if (inviterGets) await add(ref.referrer_id);
    return { bonus };
  } catch {
    return { bonus: 0 };
  }
}
