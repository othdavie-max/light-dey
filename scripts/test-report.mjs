// End-to-end check of POST /api/report against the real database, using a throwaway spot and throwaway
// test users (all deleted at the end). Needs a dev server running with Cloudflare's always-pass Turnstile
// test keys, see scripts/test-report.ps1. Run with: node --env-file=.env.local scripts/test-report.mjs
import { createClient } from "@supabase/supabase-js";
import { makeTestUser } from "./lib/testUser.mjs";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
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
// Throwaway signed-in user (no password, so this still works when CAPTCHA protection is on in Supabase)
const makeUser = (tag) => makeTestUser(tag, created);

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

  // ---------- Reports made while offline: saved on the phone, sent later ----------
  const { data: spot2 } = await admin.from("spots").insert({ area_id: area.id, name: `TEST OFFLINE ${Date.now()}`, status_flag: "approved", is_demo: true }).select("id").single();
  created.spot2 = spot2.id;
  const C = await makeUser("c"), D = await makeUser("d");
  const minsAgo = (m) => Date.now() - m * 60_000;
  const pre = { spotId: spot2.id, turnstileToken: TOKEN };

  check("offline: rejects a malformed client id", (await post(C.token, { ...pre, status: "on", clientId: "nope" }, dev)).status === 400);
  check("offline: rejects a time too far back (7 hours)", (await post(C.token, { ...pre, status: "on", reportedAt: minsAgo(7 * 60) }, dev)).json.error === "too_old");
  check("offline: rejects a time in the future", (await post(C.token, { ...pre, status: "on", reportedAt: Date.now() + 30 * 60_000 }, dev)).json.error === "bad_time");
  check("offline: rejects a time that is not a number", (await post(C.token, { ...pre, status: "on", reportedAt: "yesterday" }, dev)).json.error === "bad_time");

  // A report made 20 minutes ago, arriving now
  const cid = crypto.randomUUID();
  const sent = await post(C.token, { ...pre, status: "on", clientId: cid, reportedAt: minsAgo(20) }, dev);
  check("offline: a report made 20 minutes ago is accepted", sent.status === 200 && sent.json.ok && sent.json.delayed === true, JSON.stringify(sent));
  const { data: lateRows } = await admin.from("reports").select("created_at,client_id").eq("spot_id", spot2.id);
  const ageMin = (Date.now() - new Date(lateRows[0].created_at).getTime()) / 60_000;
  check("offline: it is recorded as of when it was MADE (about 20 min ago), not when it arrived", lateRows.length === 1 && ageMin > 19 && ageMin < 21, `age ${ageMin}`);
  const { data: sess } = await admin.from("supply_sessions").select("started_at,status").eq("spot_id", spot2.id);
  const sessAge = (Date.now() - new Date(sess[0].started_at).getTime()) / 60_000;
  check("offline: the supply session starts at that earlier time", sess.length === 1 && sessAge > 19 && sessAge < 21, `session age ${sessAge}`);
  check("offline: it reports the right status 'since' time", Math.abs((Date.now() - new Date(sent.json.since).getTime()) / 60_000 - 20) < 1);

  // The same report sent again (the reply was lost): counted once
  const again = await post(C.token, { ...pre, status: "on", clientId: cid, reportedAt: minsAgo(20) }, dev);
  const { data: afterDup } = await admin.from("reports").select("id").eq("spot_id", spot2.id);
  check("offline: sending the same report again is recognised, not counted twice", again.status === 200 && again.json.duplicate === true && afterDup.length === 1, JSON.stringify(again));
  const { data: profC } = await admin.from("profiles").select("points").eq("id", C.id).single();
  check("offline: and it does not earn points twice", profC.points === 15, `points ${profC.points}`);

  // Cannot slip a report in before one's own earlier one
  const back = await post(C.token, { ...pre, status: "off", clientId: crypto.randomUUID(), reportedAt: minsAgo(60) }, dev);
  check("offline: cooldown counts from when it was made (cannot back-date past your own report)", back.status === 429 && back.json.error === "cooldown", JSON.stringify(back));

  // Another person's saved report made 5 minutes ago: NEWER than the last one (20 min ago), so it changes the status
  // at that moment (a quiet spot can be changed by one fresh trusted report)
  const newer = await post(D.token, { ...pre, status: "off", clientId: crypto.randomUUID(), reportedAt: minsAgo(5) }, { "x-device-id": crypto.randomUUID() });
  check("offline: a newer saved report is accepted and changes the status", newer.status === 200 && newer.json.status === "off", JSON.stringify(newer));
  const { data: sessN } = await admin.from("supply_sessions").select("status,started_at,ended_at").eq("spot_id", spot2.id).order("started_at");
  const endedAgo = sessN[0].ended_at ? (Date.now() - new Date(sessN[0].ended_at).getTime()) / 60_000 : null;
  check("offline: the old session ends at the time the change HAPPENED (about 5 min ago)", sessN.length === 2 && endedAgo > 4 && endedAgo < 6 && sessN[1].status === "off" && sessN[1].ended_at === null, JSON.stringify(sessN));

  // A third person's saved report made 25 minutes ago: OLDER than the newest report, so it is only a vote and cannot rewrite history
  const E = await makeUser("e");
  const late = await post(E.token, { ...pre, status: "on", clientId: crypto.randomUUID(), reportedAt: minsAgo(25) }, { "x-device-id": crypto.randomUUID() });
  check("offline: a report older than the newest one is accepted", late.status === 200 && late.json.ok, JSON.stringify(late));
  const { data: sess3 } = await admin.from("supply_sessions").select("status,ended_at").eq("spot_id", spot2.id);
  check("offline: but it cannot create or end supply sessions in the past", sess3.length === 2, JSON.stringify(sess3));
  const { data: lateRow } = await admin.from("reports").select("created_at").eq("spot_id", spot2.id).eq("user_id", E.id);
  check("offline: the late vote is stored at its own time (about 25 min ago)", lateRow.length === 1 && Math.abs((Date.now() - new Date(lateRow[0].created_at).getTime()) / 60_000 - 25) < 1);
} catch (e) {
  console.error("TEST CRASHED:", e);
  failures++;
} finally {
  if (created.spot) await admin.from("spots").delete().eq("id", created.spot);
  if (created.spot2) await admin.from("spots").delete().eq("id", created.spot2);
  for (const id of created.users) await admin.auth.admin.deleteUser(id);
  console.log(failures ? `\n${failures} check(s) FAILED` : "\nAll checks passed. Test data cleaned up.");
  process.exit(failures ? 1 : 0);
}
