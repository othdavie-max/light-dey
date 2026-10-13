// End-to-end check of /api/me (download my data, delete my account) and the consent record, against the real
// database with throwaway users and a throwaway spot (all removed at the end). Run with a server running:
//   BASE_URL=http://localhost:3000 node --env-file=.env.local scripts/test-me.mjs
import { makeTestUser, testClients } from "./lib/testUser.mjs";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const { admin: db } = testClients();

let failures = 0;
const check = (name, ok, detail = "") => { console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : "  -> " + detail}`); if (!ok) failures++; };
const me = (token, method) => fetch(`${BASE}/api/me`, { method, headers: token ? { authorization: `Bearer ${token}` } : {} });

const created = { users: [], spot: null };
try {
  const N = await makeTestUser("me", created), OTHER = await makeTestUser("other", created), ADMIN = await makeTestUser("adm", created);
  await db.from("profiles").update({ is_admin: true }).eq("id", ADMIN.id);
  await db.from("profiles").update({ points: 42, streak_current: 3, nickname: "Me-Test-Nick" }).eq("id", N.id);

  const { data: area } = await db.from("areas").select("id").eq("slug", "wuye").single();
  const { data: spot } = await db.from("spots").insert({ area_id: area.id, name: `TEST ME ${Date.now()}`, status_flag: "approved", is_demo: true, created_by: N.id }).select("id").single();
  created.spot = spot.id;
  await db.from("saved_spots").insert({ user_id: N.id, spot_id: spot.id, label: "Home", position: 0 });
  await db.from("reports").insert([
    { spot_id: spot.id, user_id: N.id, status: "on", ip_hash: "hash-aaa", is_demo: true },
    { spot_id: spot.id, user_id: N.id, status: "off", ip_hash: "hash-bbb", is_demo: true },
    { spot_id: spot.id, user_id: OTHER.id, status: "weak", ip_hash: "hash-ccc", is_demo: true },
  ]);

  // ---- consent record ----
  const stamp = new Date().toISOString();
  const consent = await N.client.from("profiles").update({ consented_at: stamp, consent_version: "2026-10-14" }).eq("id", N.id).select("consent_version").single();
  check("consent: a person can record their own agreement", !consent.error && consent.data.consent_version === "2026-10-14", JSON.stringify(consent.error));
  const other = await OTHER.client.from("profiles").update({ consent_version: "forged" }).eq("id", N.id).select();
  check("consent: nobody can write it for someone else", (other.data ?? []).length === 0);

  // ---- who may use it ----
  check("download: refused without a sign-in (401)", (await me(null, "GET")).status === 401);
  check("delete: refused without a sign-in (401)", (await me(null, "DELETE")).status === 401);

  // ---- download ----
  const res = await me(N.token, "GET");
  const dump = await res.json();
  check("download: works and is offered as a file", res.status === 200 && /attachment/.test(res.headers.get("content-disposition") ?? ""));
  check("download: contains the person's account and settings", dump.account?.nickname === "Me-Test-Nick" && dump.account.points === 42 && dump.account.consent_version === "2026-10-14", JSON.stringify(dump.account));
  check("download: contains their saved spots", dump.savedSpots.length === 1 && dump.savedSpots[0].label === "Home");
  check("download: contains exactly their own reports (2, not the other person's)", dump.reports.length === 2 && dump.reports.every((r) => r.status !== "weak"), JSON.stringify(dump.reports));
  check("download: lists the spots they added", dump.spotsYouAdded.length === 1);
  check("download: does not expose scrambled network codes", !JSON.stringify(dump).includes("hash-aaa") && !("ip_hash" in (dump.reports[0] ?? {})));

  // ---- delete ----
  const adminTry = await me(ADMIN.token, "DELETE");
  check("delete: an admin account is refused (another admin must remove it)", adminTry.status === 403);
  const del = await me(N.token, "DELETE");
  check("delete: works", del.status === 200 && (await del.json()).ok === true);
  const gone = await db.auth.admin.getUserById(N.id);
  check("delete: the account no longer exists", !!gone.error || !gone.data?.user, JSON.stringify(gone.data));
  check("delete: the profile is gone", (await db.from("profiles").select("id").eq("id", N.id)).data.length === 0);
  check("delete: saved spots are gone", (await db.from("saved_spots").select("spot_id").eq("user_id", N.id)).data.length === 0);
  const { data: left } = await db.from("reports").select("user_id,ip_hash,status").eq("spot_id", spot.id).order("status");
  check("delete: the reports stay in the statistics but are cut loose (no person, no network code)", left.length === 3 && left.filter((r) => r.status !== "weak").every((r) => r.user_id === null && r.ip_hash === null), JSON.stringify(left));
  check("delete: another person's report is untouched", left.find((r) => r.status === "weak")?.ip_hash === "hash-ccc");
  const { data: sp } = await db.from("spots").select("created_by").eq("id", spot.id).single();
  check("delete: spots they added stay, with no owner", sp.created_by === null);
  check("delete: the old sign-in no longer works", (await me(N.token, "GET")).status === 401);
} catch (e) {
  console.error("TEST CRASHED:", e);
  failures++;
} finally {
  if (created.spot) { await db.from("reports").delete().eq("spot_id", created.spot); await db.from("spots").delete().eq("id", created.spot); }
  for (const id of created.users) await db.auth.admin.deleteUser(id);
  console.log(failures ? `\n${failures} check(s) FAILED` : "\nAll checks passed. Test data cleaned up.");
  process.exit(failures ? 1 : 0);
}
