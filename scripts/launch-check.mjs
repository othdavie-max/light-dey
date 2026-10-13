// Before you launch, run:  npm run launch-check
// It checks the real things (not just a list): placeholders still in the legal text, leftover demo data,
// whether an admin exists, whether bot protection is really on for new accounts, and your keys.
// Items marked BLOCKER should be fixed before you tell the public. WARN items are worth a look.
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const results = [];
const add = (level, title, detail = "") => results.push({ level, title, detail });
const url = process.env.NEXT_PUBLIC_SUPABASE_URL, anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// ---- 1. Your keys ----
for (const k of ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY", "TURNSTILE_SECRET_KEY", "IP_HASH_SALT", "NEXT_PUBLIC_VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY"]) {
  if (!process.env[k]) add("BLOCKER", `Missing key in .env.local: ${k}`);
}
if ((process.env.IP_HASH_SALT ?? "").length > 0 && process.env.IP_HASH_SALT.length < 20) add("WARN", "IP_HASH_SALT is short", "Use a long random phrase (30+ characters).");
if (!url || !anonKey || !serviceKey) { print(); process.exit(1); }

// ---- 2. Placeholders in the legal text ----
const config = readFileSync(new URL("../config/app.config.ts", import.meta.url), "utf8");
const legalBlock = config.match(/legal:\s*\{[\s\S]*?\n  \},/)?.[0] ?? "";
const placeholders = [...legalBlock.matchAll(/(\w+):\s*"(\[[^\]]+\])"/g)].map((m) => `${m[1]} = ${m[2]}`);
if (placeholders.length) add("BLOCKER", "Your business details are still placeholders in config/app.config.ts", placeholders.join("; "));
else add("OK", "Business details filled in");
const siteKey = config.match(/turnstileSiteKey:\s*"([^"]+)"/)?.[1] ?? "";
if (/^1x0{10,}/.test(siteKey) || !siteKey) add("BLOCKER", "The Turnstile site key in config is missing or is Cloudflare's test key");
else add("OK", "Turnstile site key is a real one");

const db = createClient(url, serviceKey, { auth: { persistSession: false } });

// ---- 3. Demo data ----
const [demoSpots, demoReports, demoDevices] = await Promise.all([
  db.from("spots").select("id", { count: "exact", head: true }).eq("is_demo", true),
  db.from("reports").select("id", { count: "exact", head: true }).eq("is_demo", true),
  db.from("devices").select("id", { count: "exact", head: true }).like("device_hash", "demo-%"),
]);
const demoTotal = (demoSpots.count ?? 0) + (demoReports.count ?? 0) + (demoDevices.count ?? 0);
if (demoTotal > 0) add("BLOCKER", `Demo data is still in the live database (${demoSpots.count} spots, ${demoReports.count} reports)`, "Run: npm run demo:clear");
else add("OK", "No demo data in the database");

// ---- 4. Test leftovers ----
const { data: flags } = await db.from("flags").select("id,target_type,target_id").eq("status", "open");
const spotIds = (flags ?? []).filter((f) => f.target_type === "spot").map((f) => f.target_id);
const { data: live } = spotIds.length ? await db.from("spots").select("id").in("id", spotIds) : { data: [] };
const liveSet = new Set((live ?? []).map((s) => s.id));
const orphans = (flags ?? []).filter((f) => f.target_type === "spot" && !liveSet.has(f.target_id)).length;
if (orphans > 0) add("WARN", `${orphans} open flag(s) point at spots that no longer exist`, "Dismiss them in /admin, Flags.");

// ---- 5. An admin exists ----
const { count: admins } = await db.from("profiles").select("id", { count: "exact", head: true }).eq("is_admin", true);
if (!admins) add("BLOCKER", "Nobody is an admin yet", "Run: npm run make-admin -- your@email.com");
else add("OK", `${admins} admin account(s)`);

// ---- 6. Things waiting for review ----
const { count: pending } = await db.from("spots").select("id", { count: "exact", head: true }).eq("status_flag", "pending").eq("is_demo", false);
if (pending) add("WARN", `${pending} new spot(s) are waiting for review in /admin`);

// ---- 7. Band numbers ----
const { data: bands } = await db.from("band_thresholds").select("band,source_note").limit(20);
if ((bands ?? []).some((b) => /unverified|verify/i.test(b.source_note ?? ""))) add("BLOCKER", "Band hours are still marked unverified", "Check them against NERC's current order, then add corrected rows in /admin, Data.");
else add("OK", "Band hours are marked as verified");

// ---- 8. Is bot protection really on for new accounts? ----
// Try to create an anonymous account WITHOUT a CAPTCHA token, exactly like a bot would.
const probe = await fetch(`${url}/auth/v1/signup`, { method: "POST", headers: { apikey: anonKey, "content-type": "application/json" }, body: JSON.stringify({ data: {} }) });
const probeJson = await probe.json().catch(() => ({}));
if (probe.ok && probeJson.user?.id) {
  await db.auth.admin.deleteUser(probeJson.user.id);
  add("BLOCKER", "CAPTCHA protection is OFF: a bot can create unlimited accounts", "In Supabase: Authentication > Attack Protection > turn on CAPTCHA, choose Cloudflare Turnstile, paste your Turnstile SECRET key.");
} else if (/captcha/i.test(JSON.stringify(probeJson))) add("OK", "CAPTCHA protection is ON for new accounts");
else if (/anonymous/i.test(JSON.stringify(probeJson))) add("BLOCKER", "Anonymous sign-ins are switched OFF in Supabase", "Authentication > Sign In / Providers > Allow anonymous sign-ins.");
else add("WARN", "Could not tell whether CAPTCHA is on", JSON.stringify(probeJson).slice(0, 120));

print();

function print() {
  const icon = { OK: "OK     ", WARN: "WARN   ", BLOCKER: "BLOCKER" };
  for (const r of results) console.log(`${icon[r.level]}  ${r.title}${r.detail ? `\n         ${r.detail}` : ""}`);
  const blockers = results.filter((r) => r.level === "BLOCKER").length, warns = results.filter((r) => r.level === "WARN").length;
  console.log(`\n${blockers ? `${blockers} blocker(s) to fix before launch.` : "No blockers."} ${warns ? `${warns} warning(s).` : ""}`);
  console.log("Also do by hand (these cannot be checked automatically): have a Nigerian lawyer read the Privacy Policy and Terms; make sure NDPC registration is handled if it applies to you; set the Supabase Site URL and redirect URLs; set up a proper email sender for sign-in emails.");
  process.exitCode = blockers ? 1 : 0;
}
