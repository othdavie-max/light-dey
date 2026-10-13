// End-to-end check of POST /api/report against the real database, using a throwaway spot and throwaway
// test users (all deleted at the end). Needs a dev server running with Cloudflare's always-pass Turnstile
// test keys, see scripts/test-report.ps1. Run with: node --env-file=.env.local scripts/test-report.mjs
import { createClient } from "@supabase/supabase-js";

const BASE = process.env.BASE_URL ?? "http://localhost:3100";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const anon = () => createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });

let failures = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : "  -> " + detail}`);
  if (!ok) failures++;
};
const post = (token, body, headers = {}) =>
  fetch(`${BASE}/api/report`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers },
    body: JSON.stringify(body),
  }).then(async (r) => ({ status: r.status, json: await r.json() }));

const created = { users: [], spot: null };
async function makeUser(tag) {
  const email = `ld-test-${tag}-${Date.now()}@example.com`, password = `Tmp-${crypto.randomUUID()}`;
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  created.users.push(data.user.id);
  const { data: s, error: e2 } = await anon().auth.signInWithPassword({ email, password });
  if (e2) throw e2;
  return { id: data.user.id, token: s.session.access_token };
}

try {
  const { data: area } = await admin.from("areas").select("id").eq("slug", "wuye").single();
  const { data: spot, error } = await admin.from("spots")
    .insert({ area_id: area.id, name: `TEST SPOT ${Date.now()}`, status_flag: "approved", is_demo: true }).select("id").single();
  if (error) throw error;
  created.spot = spot.id;
  const A = await makeUser("a"), B = await makeUser("b");
  const TOKEN = "XXXX.DUMMY.TOKEN.XXXX";
  const dev = { "x-device-id": crypto.randomUUID() };

  check("rejects a request with no sign-in", (await post(null, { spotId: spot.id, status: "on" })).status === 401);
  check("rejects a bad status", (await post(A.token, { spotId: spot.id, status: "banana", turnstileToken: TOKEN }, dev)).status === 400);
  check("rejects a malformed spot id", (await post(A.token, { spotId: "nope", status: "on", turnstileToken: TOKEN }, dev)).status === 400);
  check("rejects a missing bot-check token", (await post(A.token, { spotId: spot.id, status: "on" }, dev)).status === 403);
  check("404 for a spot that does not exist", (await post(A.token, { spotId: crypto.randomUUID(), status: "on", turnstileToken: TOKEN }, dev)).status === 404);

  // First report on an unknown spot
  const r1 = await post(A.token, { spotId: spot.id, status: "on", turnstileToken: TOKEN }, dev);
  check("first report accepted", r1.status === 200 && r1.json.ok, JSON.stringify(r1));
  check("status becomes 'on'", r1.json.status === "on");
  check("not a confirmation; points = 10 + 5 change bonus", r1.json.isConfirmation === false && r1.json.pointsAwarded === 15, JSON.stringify(r1.json));
  check("streak starts at 1", r1.json.streak === 1);

  // Cooldown
  const r2 = await post(A.token, { spotId: spot.id, status: "on", turnstileToken: TOKEN }, dev);
  check("same person again within 10 minutes is blocked (429)", r2.status === 429 && r2.json.error === "cooldown" && r2.json.retryAfterSeconds > 0, JSON.stringify(r2));

  // Database state
  const { data: reports } = await admin.from("reports").select("*").eq("spot_id", spot.id);
  check("exactly one report saved", reports.length === 1 && reports[0].status === "on");
  check("report stores a hashed IP, never a raw one", /^[0-9a-f]{64}$/.test(reports[0].ip_hash ?? ""));
  const { data: st } = await admin.from("spot_status").select("*").eq("spot_id", spot.id).single();
  check("spot_status updated", st.status === "on" && st.last_report_at && st.since);
  const { data: sess1 } = await admin.from("supply_sessions").select("*").eq("spot_id", spot.id);
  check("an open 'on' supply session exists", sess1.length === 1 && sess1[0].status === "on" && sess1[0].ended_at === null);

  // Another person, quiet spot: a fresh trusted report can change it
  const r3 = await post(B.token, { spotId: spot.id, status: "off", turnstileToken: TOKEN }, { "x-device-id": crypto.randomUUID() });
  check("second person's report accepted", r3.status === 200 && r3.json.ok, JSON.stringify(r3));
  check("quiet spot flips to 'off'", r3.json.status === "off", JSON.stringify(r3.json));
  const { data: sess2 } = await admin.from("supply_sessions").select("*").eq("spot_id", spot.id).order("started_at");
  check("old session closed and a new 'off' session opened", sess2.length === 2 && sess2[0].ended_at && sess2[1].status === "off" && sess2[1].ended_at === null, JSON.stringify(sess2));

  // The browser (anon key) must not be able to read reports or write statuses
  const pub = anon();
  const readReports = await pub.from("reports").select("id").eq("spot_id", spot.id);
  check("public key cannot read raw reports", (readReports.data ?? []).length === 0);
  const writeStatus = await pub.from("spot_status").update({ status: "on" }).eq("spot_id", spot.id).select();
  check("public key cannot change a spot's status", (writeStatus.data ?? []).length === 0);

  // Profile points
  const { data: prof } = await admin.from("profiles").select("points,streak_current").eq("id", A.id).single();
  check("points and streak saved to the profile", prof.points === 15 && prof.streak_current === 1, JSON.stringify(prof));
} catch (e) {
  console.error("TEST CRASHED:", e);
  failures++;
} finally {
  if (created.spot) await admin.from("spots").delete().eq("id", created.spot);
  for (const id of created.users) await admin.auth.admin.deleteUser(id);
  console.log(failures ? `\n${failures} check(s) FAILED` : "\nAll checks passed. Test data cleaned up.");
  process.exit(failures ? 1 : 0);
}
