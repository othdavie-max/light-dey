"use client";
import { supabase } from "./supabase/browser";
import { appConfig } from "../../config/app.config";

/** This person's private invite code, kept on the phone after the first lookup. */
export async function myReferralCode(): Promise<string | null> {
  try { const c = localStorage.getItem("ld_refcode"); if (c) return c; } catch { /* storage blocked */ }
  try {
    const sb = supabase();
    const { data: s } = await sb.auth.getSession();
    const uid = s.session?.user.id;
    if (!uid) return null;
    const { data } = await sb.from("profiles").select("referral_code").eq("id", uid).maybeSingle();
    const code = (data?.referral_code as string | undefined) ?? null;
    if (code) { try { localStorage.setItem("ld_refcode", code); } catch { /* storage blocked */ } }
    return code;
  } catch { return null; }
}

export type ShareOutcome = "shared" | "copied" | "cancelled";

/**
 * Share a link with a picture card. On phones that allow it, the card image goes straight into WhatsApp & co;
 * otherwise the link is shared (its preview shows the same card), or copied.
 * `cardQuery` is the query for /api/card, for example "spot=<id>&lang=pcm".
 */
export async function shareWithCard(opts: { path: string; text: string; cardQuery?: string }): Promise<ShareOutcome> {
  const code = await myReferralCode();
  const base = typeof window !== "undefined" && window.location.origin ? window.location.origin : appConfig.siteUrl;
  const url = `${base}${opts.path}${code ? `${opts.path.includes("?") ? "&" : "?"}ref=${code}` : ""}`;
  try {
    if (opts.cardQuery && navigator.canShare) {
      try {
        const res = await fetch(`/api/card?${opts.cardQuery}&square=1`);
        if (res.ok) {
          const file = new File([await res.blob()], "light-dey.png", { type: "image/png" });
          if (navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], text: `${opts.text} ${url}` }); return "shared"; }
        }
      } catch (e) { if ((e as Error).name === "AbortError") return "cancelled"; /* fall through to a link share */ }
    }
    if (navigator.share) { await navigator.share({ title: "Light Dey?", text: opts.text, url }); return "shared"; }
    await navigator.clipboard.writeText(url);
    return "copied";
  } catch (e) {
    if ((e as Error).name === "AbortError") return "cancelled";
    try { await navigator.clipboard.writeText(url); return "copied"; } catch { return "cancelled"; }
  }
}
