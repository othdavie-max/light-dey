// POST /api/spot-attributes: a person tells us which DisCo and tariff band a spot has.
// Rules: it only FILLS a blank value (it never overwrites what is already there), and every suggestion
// is also put in the admin review queue (flags) so a wrong one can be corrected.
import { NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { slidingWindow } from "@/lib/ratelimit";

const BANDS = ["A", "B", "C", "D", "E"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LIMIT = { windowSeconds: 3600, max: 20 };

const fail = (status: number, error: string) => NextResponse.json({ ok: false, error }, { status });

export async function POST(req: Request) {
  const now = new Date();
  const db = adminClient();

  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return fail(401, "not_signed_in");
  const { data: auth } = await db.auth.getUser(token);
  const user = auth?.user;
  if (!user) return fail(401, "not_signed_in");

  let body: { spotId?: string; discoId?: number | null; band?: string | null };
  try { body = await req.json(); } catch { return fail(400, "bad_request"); }
  const { spotId } = body;
  const discoId = body.discoId ?? null;
  const band = body.band ?? null;
  if (!spotId || !UUID.test(spotId)) return fail(400, "bad_request");
  if (band !== null && !BANDS.includes(band)) return fail(400, "bad_request");
  if (discoId !== null && !Number.isInteger(discoId)) return fail(400, "bad_request");
  if (discoId === null && band === null) return fail(400, "nothing_to_set");

  // Gentle rate limit so nobody floods the review queue
  const key = `attr:${user.id}`;
  const since = new Date(now.getTime() - LIMIT.windowSeconds * 1000).toISOString();
  const { data: hits } = await db.from("rate_limit_hits").select("hit_at").eq("key", key).gt("hit_at", since).limit(100);
  if (!slidingWindow((hits ?? []).map((h) => new Date(h.hit_at)), now, LIMIT).allowed) return fail(429, "rate_limited");
  await db.from("rate_limit_hits").insert({ key });

  const { data: profile } = await db.from("profiles").select("is_banned").eq("id", user.id).maybeSingle();
  if (profile?.is_banned) return fail(403, "banned");

  const { data: spot } = await db.from("spots").select("id,disco_id,band,status_flag").eq("id", spotId).maybeSingle();
  if (!spot || spot.status_flag === "rejected") return fail(404, "spot_not_found");

  if (discoId !== null) {
    const { data: disco } = await db.from("discos").select("id").eq("id", discoId).eq("is_active", true).maybeSingle();
    if (!disco) return fail(400, "unknown_disco");
  }

  // Fill blanks only
  const update: Record<string, unknown> = {};
  if (discoId !== null && spot.disco_id === null) update.disco_id = discoId;
  if (band !== null && spot.band === null) update.band = band;

  if (Object.keys(update).length > 0) {
    const { error } = await db.from("spots").update(update).eq("id", spotId);
    if (error) return fail(500, "could_not_save");
    await db.from("flags").insert({
      kind: "attributes", target_type: "spot", target_id: spotId,
      reason: `Suggested ${Object.entries(update).map(([k, v]) => `${k}=${v}`).join(", ")}`,
      details: update,                  // exactly what was filled in, so an admin can undo it
      created_by: user.id,
    });
  }

  return NextResponse.json({ ok: true, applied: Object.keys(update), alreadySet: Object.keys(update).length === 0 });
}
