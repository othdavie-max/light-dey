"use client";
import { lite, type LiteClient } from "./lite";

/**
 * The client the public pages use: a tiny one (see lite.ts). The full Supabase library is only loaded on the
 * admin page and, a moment after the home screen has appeared, for live updates.
 */
export function supabase(): LiteClient {
  return lite;
}

// ---- CAPTCHA for new sign-ins -------------------------------------------------------------------------------
// If CAPTCHA protection is switched on in Supabase (Authentication > Attack Protection), creating an anonymous
// account needs a Cloudflare Turnstile token. The page's invisible Turnstile widget registers itself here.
let captchaProvider: (() => Promise<string | null>) | null = null;
export function setCaptchaProvider(fn: (() => Promise<string | null>) | null) { captchaProvider = fn; }

async function captchaToken(): Promise<string | null> {
  // The widget loads a moment after the page does: give it a short while to register before giving up.
  for (let i = 0; i < 12 && !captchaProvider; i++) await new Promise((r) => setTimeout(r, 250));
  return captchaProvider ? captchaProvider() : null;
}

let pending: Promise<string | null> | null = null;

/**
 * Everyone gets a real (anonymous) account the first time they open the app, so the first report is
 * instant and streaks/points have somewhere to live. Signing in later upgrades the same account.
 * Callers that arrive together (React strict mode, a quick tap) share one sign-in instead of making several accounts.
 */
export function ensureSession(): Promise<string | null> {
  if (!pending) {
    pending = (async () => {
      const { data } = await lite.auth.getSession();
      if (data.session) return data.session.access_token;
      const { data: anon, error } = await lite.auth.signInAnonymously(await captchaToken());
      if (error) {
        console.error("Anonymous sign-in failed. Is 'Allow anonymous sign-ins' switched on in Supabase, and does the CAPTCHA token pass?", error.message);
        return null;
      }
      return anon.session?.access_token ?? null;
    })().finally(() => { pending = null; });
  }
  return pending;
}

/** A random id for this phone, kept on the phone. Only a hash of it is ever stored on the server. */
export function deviceId(): string {
  try {
    let id = localStorage.getItem("ld_device");
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem("ld_device", id);
    }
    return id;
  } catch {
    return "no-storage";
  }
}
