// POST /api/log-error { message, stack?, path? }  — a phone reporting that something crashed.
// No sign-in needed (the crash may be before sign-in), so it is rate-limited per network and stores nothing personal.
import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { logError } from "@/lib/errorLog";

const MAX_PER_HOUR = 20;

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { message?: unknown; stack?: unknown; path?: unknown } | null;
  if (!body || typeof body.message !== "string" || body.message.length < 1 || body.message.length > 2000) return NextResponse.json({ ok: false }, { status: 400 });

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
  const key = `err:${createHash("sha256").update(`${process.env.IP_HASH_SALT ?? ""}:ip:${ip}`).digest("hex")}`;
  try {
    const db = adminClient();
    const since = new Date(Date.now() - 3_600_000).toISOString();
    const { count } = await db.from("rate_limit_hits").select("key", { count: "exact", head: true }).eq("key", key).gt("hit_at", since);
    if ((count ?? 0) >= MAX_PER_HOUR) return NextResponse.json({ ok: true, limited: true });
    await db.from("rate_limit_hits").insert({ key });
  } catch { /* if the limiter fails we still accept one */ }

  await logError({
    source: "browser",
    message: body.message,
    stack: typeof body.stack === "string" ? body.stack : null,
    path: typeof body.path === "string" ? body.path : null,
    userAgent: req.headers.get("user-agent"),
  });
  return NextResponse.json({ ok: true });
}
