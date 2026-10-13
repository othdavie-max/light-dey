// Makes someone an admin. They sign in to /admin with an email link, so use an email you can open.
//   npm run make-admin -- you@example.com
// Creates the account if it does not exist yet (no password: sign-in is by email link), then marks it as admin.
// To remove admin rights:  npm run make-admin -- you@example.com remove
import { createClient } from "@supabase/supabase-js";

const email = (process.argv[2] ?? "").trim().toLowerCase();
const remove = process.argv[3] === "remove";
if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
  console.error("Usage: npm run make-admin -- you@example.com [remove]");
  process.exit(1);
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error("Missing Supabase keys in .env.local"); process.exit(1); }
const db = createClient(url, key, { auth: { persistSession: false } });

let user;
for (let page = 1; !user; page++) {
  const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 });
  if (error) throw error;
  user = data.users.find((u) => u.email?.toLowerCase() === email);
  if (data.users.length < 200) break;
}
if (!user && !remove) {
  const { data, error } = await db.auth.admin.createUser({ email, email_confirm: true });
  if (error) throw error;
  user = data.user;
  console.log("Created the account for", email);
}
if (!user) { console.error("No account found for", email); process.exit(1); }

const { error } = await db.from("profiles").update({ is_admin: !remove }).eq("id", user.id);
if (error) throw error;
console.log(remove ? `${email} is no longer an admin.` : `${email} is now an admin. Open /admin and ask for a sign-in link.`);
