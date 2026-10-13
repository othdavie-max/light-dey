// POST /api/referral  { code, spotId? }  — "I joined through this friend's invite link."
import { NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { claimReferral } from "@/lib/referralServer";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: Request) {
  const db = adminClient();
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const { data } = token ? await db.auth.getUser(token) : { data: null };
  if (!data?.user) return NextResponse.json({ ok: false, error: "not_signed_in" }, { status: 401 });
  const body = (await req.json().catch(() => null)) as { code?: unknown; spotId?: unknown } | null;
  if (typeof body?.code !== "string") return NextResponse.json({ ok: false, error: "bad_code" }, { status: 400 });
  const spotId = typeof body.spotId === "string" && UUID.test(body.spotId) ? body.spotId : null;
  const result = await claimReferral(db, data.user.id, body.code, spotId);
  return NextResponse.json({ ok: result === "ok" || result === "already", result }, { headers: { "Cache-Control": "no-store" } });
}
