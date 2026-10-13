// End-to-end check of the onboarding rules against the real database, using throwaway users and spots
// (all deleted at the end). Needs the dev server running. Run:
//   BASE_URL=http://localhost:3000 node --env-file=.env.local scripts/test-onboarding.mjs
import { createClient } from "@supabase/supabase-js";
import { makeTestUser } from "./lib/testUser.mjs";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

let failures = 0;
const check = (name, ok, detail = "") => { console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : "  -> " + detail}`); if (!ok) failures++; };
const post = (token, body) => fetch(`${BASE}/api/spot-attributes`, {
  method: "POST",
  headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
  body: JSON.stringify(body),
}).then(async (r) => ({ status: r.status, json: await r.json() }));

const created = { users: [], spots: [] };
// Throwaway signed-in user (no password, so this still works when CAPTCHA protection is on in Supabase)
const makeUser = (tag) => makeTestUser(tag, created);

try {
  const { data: area } = await admin.from("areas").select("id").eq("slug", "wuye").single();
  const { data: disco } = await admin.from("discos").select("id").eq("code", "AEDC").single();
  const A = await makeUser("a"), B = await makeUser("b");

  // A spot with no DisCo or band yet
  const { data: spot } = await admin.from("spots").insert({ area_id: area.id, name: `TEST ATTR ${Date.now()}`, status_flag: "approved", is_demo: true }).select("id").single();
  created.spots.push(spot.id);

  check("attributes: rejects no sign-in", (await post(null, { spotId: spot.id, band: "C" })).status === 401);
  check("attributes: rejects a bad band", (await post(A.token, { spotId: spot.id, band: "Z" })).status === 400);
  check("attributes: rejects an empty request", (await post(A.token, { spotId: spot.id })).status === 400);
  check("attributes: rejects an unknown DisCo", (await post(A.token, { spotId: spot.id, discoId: 999999 })).status === 400);
  check("attributes: 404 for a missing spot", (await post(A.token, { spotId: crypto.randomUUID(), band: "C" })).status === 404);

  const r1 = await post(A.token, { spotId: spot.id, discoId: disco.id, band: "C" });
  check("attributes: fills a blank DisCo and band", r1.status === 200 && r1.json.applied.length === 2, JSON.stringify(r1));
  const { data: s1 } = await admin.from("spots").select("disco_id,band").eq("id", spot.id).single();
  check("attributes: saved on the spot", s1.disco_id === disco.id && s1.band === "C");
  const { data: fl } = await admin.from("flags").select("kind").eq("target_id", spot.id);
  check("attributes: suggestion queued for admin review", fl.length === 1 && fl[0].kind === "attributes");

  const r2 = await post(B.token, { spotId: spot.id, band: "A" });
  const { data: s2 } = await admin.from("spots").select("band").eq("id", spot.id).single();
  check("attributes: never overwrites an existing band", r2.json.alreadySet === true && s2.band === "C", JSON.stringify(r2));

  // Adding a new spot straight from the browser (Row Level Security)
  const name = `Sunshine Estate ${Date.now() % 10000}`;
  const ins = await A.client.from("spots").insert({ area_id: area.id, name, created_by: A.id, status_flag: "pending" }).select("id,status_flag").single();
  if (ins.data) created.spots.push(ins.data.id);
  check("new spot: a person can add one, and it starts as 'pending'", !ins.error && ins.data.status_flag === "pending", JSON.stringify(ins.error));
  const { data: ss } = await admin.from("spot_status").select("status").eq("spot_id", ins.data.id).maybeSingle();
  check("new spot: gets an 'unknown' status row automatically", ss?.status === "unknown");

  const approved = await A.client.from("spots").insert({ area_id: area.id, name: `Sneaky ${Date.now()}`, created_by: A.id, status_flag: "approved" });
  check("new spot: cannot add a pre-approved spot", !!approved.error);
  const asOther = await A.client.from("spots").insert({ area_id: area.id, name: `Spoof ${Date.now()}`, created_by: B.id, status_flag: "pending" });
  check("new spot: cannot add a spot in someone else's name", !!asOther.error);
  const dup = await B.client.from("spots").insert({ area_id: area.id, name, created_by: B.id, status_flag: "pending" });
  check("new spot: same name in the same area is refused", dup.error?.code === "23505", JSON.stringify(dup.error));

  const sim = await B.client.rpc("similar_spots", { p_area_id: area.id, p_name: name.replace("Estate", "Estat") });
  check("new spot: 'did you mean' finds the similar name", (sim.data ?? []).some((s) => s.id === ins.data.id), JSON.stringify(sim.data));
  const ownEdit = await A.client.from("spots").update({ band: "A" }).eq("id", ins.data.id).select();
  check("new spot: its creator cannot edit it directly (only admins can)", (ownEdit.data ?? []).length === 0);

  // Saved spots (max 3, private)
  const extra = [];
  for (let i = 0; i < 3; i++) {
    const { data } = await admin.from("spots").insert({ area_id: area.id, name: `TEST SAVE ${i} ${Date.now()}`, status_flag: "approved", is_demo: true }).select("id").single();
    created.spots.push(data.id); extra.push(data.id);
  }
  for (let i = 0; i < 3; i++) await A.client.from("saved_spots").insert({ user_id: A.id, spot_id: extra[i], label: ["Home", "Office", "Mum's house"][i], position: i });
  const fourth = await A.client.from("saved_spots").insert({ user_id: A.id, spot_id: spot.id, position: 3 });
  check("saved spots: a 4th is refused", !!fourth.error && /at most 3/.test(fourth.error.message), JSON.stringify(fourth.error));
  const seeOthers = await B.client.from("saved_spots").select("spot_id");
  check("saved spots: other people cannot see them", (seeOthers.data ?? []).length === 0);
  const forgery = await B.client.from("saved_spots").insert({ user_id: A.id, spot_id: spot.id, position: 0 });
  check("saved spots: cannot save a spot for someone else", !!forgery.error);
  const own = await A.client.from("saved_spots").delete().eq("user_id", A.id).eq("spot_id", extra[2]).select();
  check("saved spots: a person can remove their own", (own.data ?? []).length === 1);
} catch (e) {
  console.error("TEST CRASHED:", e);
  failures++;
} finally {
  for (const id of created.spots) await admin.from("spots").delete().eq("id", id);
  for (const id of created.users) await admin.auth.admin.deleteUser(id);
  console.log(failures ? `\n${failures} check(s) FAILED` : "\nAll checks passed. Test data cleaned up.");
  process.exit(failures ? 1 : 0);
}
