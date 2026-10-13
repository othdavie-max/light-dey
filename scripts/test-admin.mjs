// End-to-end check of /api/admin against the real database with throwaway users, spots and reference rows
// (everything is removed at the end). Needs a server running with Cloudflare's always-pass Turnstile test keys. Run:
//   BASE_URL=http://localhost:3100 node --env-file=.env.local scripts/test-admin.mjs
import { createClient } from "@supabase/supabase-js";

const BASE = process.env.BASE_URL ?? "http://localhost:3100";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const db = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const anon = () => createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });

let failures = 0;
const check = (name, ok, detail = "") => { console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : "  -> " + detail}`); if (!ok) failures++; };
const call = (token, method, path, body) => fetch(`${BASE}/api/admin${path}`, {
  method, headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
  body: body ? JSON.stringify(body) : undefined,
}).then(async (r) => ({ status: r.status, json: await r.json() }));
const get = (t, q) => call(t, "GET", q);
const post = (t, b) => call(t, "POST", "", b);

const created = { users: [], spots: [], discos: [], bands: [], area: null };
const started = new Date().toISOString();
async function makeUser(tag) {
  const email = `ld-test-${tag}-${Date.now()}@example.com`, password = `Tmp-${crypto.randomUUID()}`;
  const { data, error } = await db.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  created.users.push(data.user.id);
  const { data: s, error: e2 } = await anon().auth.signInWithPassword({ email, password });
  if (e2) throw e2;
  return { id: data.user.id, token: s.session.access_token };
}

try {
  const ADMIN = await makeUser("admin"), NORMAL = await makeUser("normal");
  await db.from("profiles").update({ is_admin: true }).eq("id", ADMIN.id);
  const { data: anonSession } = await anon().auth.signInAnonymously();
  if (anonSession.user) created.users.push(anonSession.user.id);

  // ---------- who may use it ----------
  check("no sign-in is refused (401)", (await get(null, "?view=overview")).status === 401);
  check("an anonymous visitor is refused (401)", (await get(anonSession.session.access_token, "?view=overview")).status === 401);
  check("a normal signed-in person is refused (403)", (await get(NORMAL.token, "?view=overview")).status === 403);
  check("a normal person cannot make changes either (403)", (await post(NORMAL.token, { action: "user.ban", id: ADMIN.id })).status === 403);
  check("a normal person cannot call the database functions directly", !!(await anon().rpc("admin_overview", {})).error);

  // ---------- overview ----------
  const ov = await get(ADMIN.token, "?view=overview");
  check("admin sees the overview", ov.status === 200 && ov.json.overview?.totals && Array.isArray(ov.json.overview.per_day), JSON.stringify(ov).slice(0, 200));

  // ---------- spots: review queue ----------
  const { data: area } = await db.from("areas").select("id").eq("slug", "wuye").single();
  const mk = async (name, extra = {}) => {
    const { data, error } = await db.from("spots").insert({ area_id: area.id, name, status_flag: "pending", created_by: NORMAL.id, ...extra }).select("id").single();
    if (error) throw error;
    created.spots.push(data.id);
    return data.id;
  };
  const stamp = Date.now() % 100000;
  const P1 = await mk(`Zebra Crescent ${stamp}`), P2 = await mk(`Zebra Cresent ${stamp}`), P3 = await mk(`Zebra Crsnt ${stamp}`);
  const queue = await get(ADMIN.token, "?view=spots");
  const q1 = queue.json.spots?.find((s) => s.id === P2);
  check("pending spots appear in the review queue with area and creator", !!q1 && q1.areas?.name === "Wuye" && !!q1.creator?.nickname, JSON.stringify(q1)?.slice(0, 200));
  check("possible duplicates are suggested", (q1?.similar ?? []).some((s) => s.id === P1), JSON.stringify(q1?.similar));
  const found = await get(ADMIN.token, `?view=spots&q=${encodeURIComponent("Zebra Crescent")}`);
  check("admin can search any spot by name", found.json.spots?.some((s) => s.id === P1));

  // ---------- spots: edit / approve / reject ----------
  check("edit: a too-short name is refused", (await post(ADMIN.token, { action: "spot.update", id: P2, name: "ab" })).json.error === "bad_name");
  check("edit: a bad band is refused", (await post(ADMIN.token, { action: "spot.update", id: P2, band: "Z" })).json.error === "bad_band");
  check("edit: an unknown DisCo is refused", (await post(ADMIN.token, { action: "spot.update", id: P2, discoId: 999999 })).json.error === "bad_disco");
  const { data: aedc } = await db.from("discos").select("id").eq("code", "AEDC").single();
  check("edit: admin can set band and DisCo", (await post(ADMIN.token, { action: "spot.update", id: P2, band: "C", discoId: aedc.id })).json.ok === true);
  const { data: s2 } = await db.from("spots").select("band,disco_id").eq("id", P2).single();
  check("edit: saved", s2.band === "C" && s2.disco_id === aedc.id);
  check("edit: renaming to an existing name is refused (409)", (await post(ADMIN.token, { action: "spot.update", id: P2, name: `Zebra Crescent ${stamp}` })).status === 409);
  check("approve: works", (await post(ADMIN.token, { action: "spot.approve", id: P1 })).json.ok === true && (await db.from("spots").select("status_flag").eq("id", P1).single()).data.status_flag === "approved");
  check("reject: works", (await post(ADMIN.token, { action: "spot.reject", id: P2 })).json.ok === true && (await db.from("spots").select("status_flag").eq("id", P2).single()).data.status_flag === "rejected");

  // ---------- spots: merge a duplicate ----------
  await db.from("reports").insert([{ spot_id: P3, user_id: NORMAL.id, status: "on" }, { spot_id: P3, user_id: NORMAL.id, status: "off" }]);
  check("merge: a spot cannot be merged into itself", (await post(ADMIN.token, { action: "spot.merge", fromId: P3, intoId: P3 })).status === 400);
  check("merge: duplicate merged into the real spot", (await post(ADMIN.token, { action: "spot.merge", fromId: P3, intoId: P1 })).json.ok === true);
  const { data: moved } = await db.from("reports").select("spot_id").eq("user_id", NORMAL.id);
  check("merge: its reports now belong to the kept spot", moved.length === 2 && moved.every((r) => r.spot_id === P1));
  const { data: dup } = await db.from("spots").select("status_flag,merged_into").eq("id", P3).single();
  check("merge: the duplicate is marked merged", dup.status_flag === "merged" && dup.merged_into === P1);
  check("merge: merging it again is refused", (await post(ADMIN.token, { action: "spot.merge", fromId: P3, intoId: P1 })).status === 400);

  // ---------- flags: DisCo/band suggestions with undo ----------
  const suggest = await fetch(`${BASE}/api/spot-attributes`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${NORMAL.token}` }, body: JSON.stringify({ spotId: P1, band: "E", discoId: aedc.id }) }).then((r) => r.json());
  check("flags: a person's suggestion is applied and queued", suggest.ok && suggest.applied.length === 2, JSON.stringify(suggest));
  const flags = await get(ADMIN.token, "?view=flags");
  const flag = flags.json.flags?.find((f) => f.target_id === P1);
  check("flags: it appears for review with the spot and what was suggested", !!flag && !!flag.spot?.name && flag.details?.band === "E", JSON.stringify(flag)?.slice(0, 220));
  const undo = await post(ADMIN.token, { action: "flag.resolve", id: flag.id, status: "resolved", undo: true });
  const { data: after } = await db.from("spots").select("band,disco_id").eq("id", P1).single();
  check("flags: undo takes the suggestion back", undo.json.ok && after.band === null && after.disco_id === null, JSON.stringify({ undo: undo.json, after }));
  check("flags: the flag is closed", (await db.from("flags").select("status").eq("id", flag.id).single()).data.status === "resolved");
  check("flags: resolving twice is refused", (await post(ADMIN.token, { action: "flag.resolve", id: flag.id, status: "resolved" })).status === 404);

  // ---------- reporters: ban / unban ----------
  const rep = await get(ADMIN.token, "?view=reporters&days=7");
  check("reporters: the list shows people with their signals", rep.status === 200 && rep.json.reporters.some((r) => r.user_id === NORMAL.id && Number(r.reports) === 2), JSON.stringify(rep.json).slice(0, 200));
  check("ban: cannot ban yourself", (await post(ADMIN.token, { action: "user.ban", id: ADMIN.id })).json.error === "cannot_ban_yourself");
  check("ban: works", (await post(ADMIN.token, { action: "user.ban", id: NORMAL.id, reason: "test" })).json.ok === true && (await db.from("profiles").select("is_banned").eq("id", NORMAL.id).single()).data.is_banned === true);
  const banned = await fetch(`${BASE}/api/report`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${NORMAL.token}`, "x-device-id": crypto.randomUUID() }, body: JSON.stringify({ spotId: P1, status: "on", turnstileToken: "XXXX.DUMMY.TOKEN.XXXX" }) }).then(async (r) => ({ s: r.status, j: await r.json() }));
  check("ban: a banned person's reports are refused", banned.s === 403 && banned.j.error === "banned", JSON.stringify(banned));
  const blockedAdmin = await get(NORMAL.token, "?view=overview");
  check("ban: and they still cannot use the admin area", blockedAdmin.status === 403);
  check("unban: works", (await post(ADMIN.token, { action: "user.unban", id: NORMAL.id })).json.ok === true && (await db.from("profiles").select("is_banned").eq("id", NORMAL.id).single()).data.is_banned === false);
  await db.from("profiles").update({ trust_score: 0.4 }).eq("id", NORMAL.id);
  await post(ADMIN.token, { action: "user.resetTrust", id: NORMAL.id });
  check("trust can be reset", (await db.from("profiles").select("trust_score").eq("id", NORMAL.id).single()).data.trust_score === 1);

  // ---------- reference data ----------
  const code = `T${stamp}`.slice(0, 8);
  const d1 = await post(ADMIN.token, { action: "disco.upsert", name: "Test Distribution Company", code, isActive: true });
  check("disco: add", d1.json.ok === true && Number.isInteger(d1.json.id), JSON.stringify(d1.json));
  if (d1.json.id) created.discos.push(d1.json.id);
  check("disco: a duplicate code is refused (409)", (await post(ADMIN.token, { action: "disco.upsert", name: "Another", code })).status === 409);
  check("disco: a bad code is refused", (await post(ADMIN.token, { action: "disco.upsert", name: "Bad Code Co", code: "no spaces!" })).status === 400);
  check("disco: edit and switch off", (await post(ADMIN.token, { action: "disco.upsert", id: d1.json.id, name: "Test Distribution Co", code, isActive: false })).json.ok === true && (await db.from("discos").select("is_active,name").eq("id", d1.json.id).single()).data.is_active === false);

  const b1 = await post(ADMIN.token, { action: "band.add", band: "A", minHoursPerDay: 21, effectiveDate: "2099-01-01", sourceNote: "test" });
  check("band: add a new threshold effective from a date", b1.json.ok === true, JSON.stringify(b1.json));
  if (b1.json.id) created.bands.push(b1.json.id);
  check("band: the same band and date twice is refused (409)", (await post(ADMIN.token, { action: "band.add", band: "A", minHoursPerDay: 22, effectiveDate: "2099-01-01" })).status === 409);
  check("band: nonsense hours are refused", (await post(ADMIN.token, { action: "band.add", band: "A", minHoursPerDay: 30, effectiveDate: "2099-02-01" })).status === 400);
  check("band: a bad date is refused", (await post(ADMIN.token, { action: "band.add", band: "B", minHoursPerDay: 10, effectiveDate: "not-a-date" })).status === 400);
  const ref = await get(ADMIN.token, "?view=reference&q=wuye");
  check("reference: lists DisCos, bands, and areas matching a search", ref.json.discos?.length >= 12 && ref.json.bands?.length >= 5 && ref.json.areas?.some((a) => a.name === "Wuye"));

  const { data: before } = await db.from("areas").select("name,city,lat,lng").eq("id", area.id).single();
  created.area = { id: area.id, ...before };
  check("area: a latitude out of range is refused", (await post(ADMIN.token, { action: "area.update", id: area.id, lat: 123 })).json.error === "bad_lat");
  check("area: edit works", (await post(ADMIN.token, { action: "area.update", id: area.id, lat: 9.0831, lng: 7.4451 })).json.ok === true);

  // ---------- the audit trail ----------
  const { data: log } = await db.from("admin_audit").select("action").eq("admin_id", ADMIN.id).gte("created_at", started);
  const acts = new Set(log.map((l) => l.action));
  check("audit: every kind of change was logged", ["spot.approve", "spot.reject", "spot.update", "spot.merge", "flag.resolve", "user.ban", "user.unban", "disco.upsert", "band.add", "area.update"].every((a) => acts.has(a)), [...acts].join(","));
  const rawAudit = await anon().from("admin_audit").select("id").limit(1);
  check("audit: a browser cannot read it", (rawAudit.data ?? []).length === 0);
} catch (e) {
  console.error("TEST CRASHED:", e);
  failures++;
} finally {
  if (created.area) await db.from("areas").update({ name: created.area.name, city: created.area.city, lat: created.area.lat, lng: created.area.lng }).eq("id", created.area.id);
  for (const id of created.bands) await db.from("band_thresholds").delete().eq("id", id);
  for (const id of created.discos) await db.from("discos").delete().eq("id", id);
  for (const id of created.spots) { await db.from("reports").delete().eq("spot_id", id); await db.from("flags").delete().eq("target_id", id); await db.from("spots").delete().eq("id", id); }
  await db.from("admin_audit").delete().gte("created_at", started).in("admin_id", created.users);
  await db.from("admin_audit").delete().gte("created_at", started).is("admin_id", null);
  for (const id of created.users) await db.auth.admin.deleteUser(id);
  console.log(failures ? `\n${failures} check(s) FAILED` : "\nAll checks passed. Test data cleaned up.");
  process.exit(failures ? 1 : 0);
}
