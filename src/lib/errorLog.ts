// SERVER ONLY. Saves crash reports to our own table (see migration 0011).
import { adminClient } from "@/lib/supabase/admin";
import { cleanPath, fingerprint, scrub, shortAgent } from "./errorScrub";

export interface ErrorReport {
  source: "browser" | "server";
  message: string;
  stack?: string | null;
  path?: string | null;
  userAgent?: string | null;
}

/** Never throws: a broken error log must not break the app. */
export async function logError(r: ErrorReport): Promise<void> {
  try {
    const message = scrub(r.message || "unknown error", 300);
    const stack = r.stack ? scrub(r.stack, 1500) : null;
    const fp = fingerprint(r.source, message, stack);
    const db = adminClient();
    const now = new Date().toISOString();
    const { data: existing } = await db.from("client_errors").select("id,count").eq("fingerprint", fp).maybeSingle();
    if (existing) {
      await db.from("client_errors").update({ count: existing.count + 1, last_seen: now, resolved: false }).eq("id", existing.id);
    } else {
      await db.from("client_errors").insert({ fingerprint: fp, source: r.source, message, stack, path: cleanPath(r.path), user_agent: shortAgent(r.userAgent) });
    }
    if (Math.random() < 0.02) await db.from("client_errors").delete().lt("last_seen", new Date(Date.now() - 60 * 86_400_000).toISOString());   // keep 60 days
  } catch { /* swallow */ }
}
