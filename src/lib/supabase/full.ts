"use client";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

/**
 * The FULL Supabase library (~60 KB). Only for the admin page (email sign-in) and for live updates, which load
 * it a moment after the screen has appeared. It shares the same saved sign-in as the tiny client in lite.ts.
 */
export function fullClient(): SupabaseClient {
  if (!client) {
    client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      auth: { persistSession: true, autoRefreshToken: true },
    });
  }
  return client;
}
