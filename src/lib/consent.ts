"use client";
import { supabase, ensureSession } from "./supabase/browser";
import { appConfig } from "../../config/app.config";

const KEY = "ld_consent";
const RECORDED = "ld_consent_recorded";

/** Has this phone agreed to the current version of the Terms and Privacy Policy? */
export function hasConsent(): boolean {
  try { return localStorage.getItem(KEY) === appConfig.legal.version; } catch { return false; }
}

/** Remember the agreement on the phone, and record it (when and which version) on the account. */
export async function acceptConsent(): Promise<void> {
  try { localStorage.setItem(KEY, appConfig.legal.version); } catch { /* storage blocked */ }
  await recordConsent();
}

/** Writes the agreement to the account. Safe to call again (for example if the first try had no network). */
export async function recordConsent(): Promise<void> {
  try {
    if (!hasConsent() || localStorage.getItem(RECORDED) === appConfig.legal.version) return;
    await ensureSession();
    const sb = supabase();
    const { data } = await sb.auth.getSession();
    const uid = data.session?.user.id;
    if (!uid) return;
    const { error } = await sb.from("profiles").update({ consented_at: new Date().toISOString(), consent_version: appConfig.legal.version }).eq("id", uid);
    if (!error) localStorage.setItem(RECORDED, appConfig.legal.version);   // done: do not repeat on every visit
  } catch { /* no network: it will be recorded next time */ }
}
