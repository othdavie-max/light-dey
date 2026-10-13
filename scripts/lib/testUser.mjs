// Shared by the end-to-end test scripts: make a throwaway signed-in user.
// Uses a one-time link exchange instead of a password, so it keeps working when CAPTCHA protection is switched on
// in Supabase (password sign-ins would then need a CAPTCHA token).
import { createClient } from "@supabase/supabase-js";

export function testClients() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const anon = () => createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  return { url, admin, anon };
}

/** Returns { id, token, client }: `client` is a Supabase client signed in as that user (for checks of what a browser may do). */
export async function makeTestUser(tag, created) {
  const { admin, anon } = testClients();
  const email = `ld-test-${tag}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
  const { data, error } = await admin.auth.admin.createUser({ email, email_confirm: true });
  if (error) throw error;
  created?.users?.push(data.user.id);
  const { data: link, error: e1 } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (e1) throw e1;
  const client = anon();
  const { data: s, error: e2 } = await client.auth.verifyOtp({ token_hash: link.properties.hashed_token, type: "magiclink" });
  if (e2) throw e2;
  return { id: data.user.id, token: s.session.access_token, client };
}
