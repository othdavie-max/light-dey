"use client";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

/** The browser's Supabase client. Uses the public key; Row Level Security protects the data. */
export function supabase(): SupabaseClient {
  if (!client) {
    client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      auth: { persistSession: true, autoRefreshToken: true },
    });
  }
  return client;
}

/**
 * Everyone gets a real (anonymous) account the first time they open the app, so the first report is
 * instant and streaks/points have somewhere to live. Signing in later upgrades the same account.
 */
let pending: Promise<string | null> | null = null;

export function ensureSession(): Promise<string | null> {
  // Callers that arrive together (React strict mode, a quick tap) share one sign-in instead of making several accounts.
  if (!pending) {
    pending = (async () => {
      const sb = supabase();
      const { data } = await sb.auth.getSession();
      if (data.session) return data.session.access_token;
      const { data: anon, error } = await sb.auth.signInAnonymously();
      if (error) {
        console.error("Anonymous sign-in failed. Is 'Allow anonymous sign-ins' switched on in Supabase?", error.message);
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
