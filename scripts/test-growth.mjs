// End-to-end check of the growth features against the real database with throwaway users and a throwaway spot
// (all removed at the end): invite links + bonus, follows, share card, leaderboards, badges in the report reply.
// Run with a server running:  BASE_URL=http://localhost:3000 node --env-file=.env.local scripts/test-growth.mjs
import { makeTestUser, testClients } from "./lib/testUser.mjs";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const { admin, anon, url } = testClients();

let failures = 0;
const check = (name, ok, detail = "") => { console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : "  -> " + detail}`); if (!ok) failures++; };
const call = (path, token, body) => fetch(`${BASE}${path}`, {
  method: "POST",
  headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}), "x-device-id": crypto.randomUUID() },
  body: JSON.stringify(body),
}).then(async (r) => ({ status: r.status, json: await r.json().catch(() => ({})) }));

const created = { users: [], spot: null, spot2: null };
try {
  const { data: area } = await admin.from("areas").select("id").eq("slug", "wuye").single();
  const { data: spot } = await admin.from("spots").insert({ area_id: area.id, name: `TEST GROWTH ${Date.now()}`, status_flag: "approved", is_demo: true }).select("id").single();
  created.spot = spot.id;
  const INV = await makeTestUser("inviter", created), FRIEND = await makeTestUser("friend", created), OLD = await makeTestUser("old", created);
  const codeOf = async (u) => (await admin.from("profiles").select("referral_code").eq("id", u.id).single()).data.referral_code;
  const pointsOf = async (u) => (await admin.from("profiles").select("points").eq("id", u.id).single()).data.points;
  const code = await codeOf(INV);
  check("every person has an 8-character invite code", /^[0-9a-f]{8}$/.test(code), code);
  check("a person cannot read someone else's invite code", ((await FRIEND.client.from("profiles").select("referral_code").eq("id", INV.id)).data ?? []).length === 0);

  // ---- referral claim ----
  check("referral: needs a sign-in", (await call("/api/referral", null, { code })).status === 401);
  check("referral: a malformed code is refused", (await call("/api/referral", FRIEND.token, { code: "zzz" })).json.result === "bad_code");
  check("referral: an unknown code is refused", (await call("/api/referral", FRIEND.token, { code: "00000000" })).json.result === "unknown_code");
  check("referral: you cannot invite yourself", (await call("/api/referral", INV.token, { code })).json.result === "self");
  await admin.from("reports").insert({ spot_id: spot.id, user_id: OLD.id, status: "on", is_demo: true });
  check("referral: someone who already reported is not 'new'", (await call("/api/referral", OLD.token, { code })).json.result === "not_new");
  const ok = await call("/api/referral", FRIEND.token, { code });
  check("referral: a new friend is recorded", ok.json.result === "ok", JSON.stringify(ok.json));
  check("referral: claiming twice is harmless", (await call("/api/referral", FRIEND.token, { code })).json.result === "already");
  check("referral: the friend is linked to the inviter", (await admin.from("profiles").select("referred_by").eq("id", FRIEND.id).single()).data.referred_by === INV.id);

  // ---- the first report pays both people ----
  const before = { inv: await pointsOf(INV), friend: await pointsOf(FRIEND) };
  const r1 = await call("/api/report", FRIEND.token, { spotId: spot.id, status: "on", turnstileToken: "XXXX.DUMMY.TOKEN.XXXX" });
  check("report: works for the invited friend", r1.status === 200 && r1.json.ok, JSON.stringify(r1.json));
  check("report: the reply tells the friend about the bonus", r1.json.referralBonus === 20, JSON.stringify(r1.json));
  check("report: reply points include the bonus", r1.json.points === before.friend + 10 + 5 + 20, `${r1.json.points} vs ${before.friend}`);
  check("bonus: the friend's points rose (report + bonus)", (await pointsOf(FRIEND)) >= before.friend + 20);
  check("bonus: the inviter earned 20", (await pointsOf(INV)) === before.inv + 20);
  const ref = (await admin.from("referrals").select("rewarded").eq("referred_id", FRIEND.id).single()).data;
  check("bonus: the invite is marked paid", ref.rewarded === true);
  const dev2 = { spotId: spot.id, status: "off", turnstileToken: "XXXX.DUMMY.TOKEN.XXXX" };
  const r2 = await call("/api/report", FRIEND.token, dev2);
  check("bonus: only the FIRST report pays (no second bonus)", (r2.json.referralBonus ?? 0) === 0 && (await pointsOf(INV)) === before.inv + 20, JSON.stringify(r2.json));
  await new Promise((r) => setTimeout(r, 2000));                       // badges are worked out just after the reply
  const { data: myBadges } = await admin.from("user_badges").select("badge_code").eq("user_id", FRIEND.id);
  check("badges: awarded after the report (founding reporter)", (myBadges ?? []).some((b) => b.badge_code === "founding_reporter"), JSON.stringify(myBadges));

  // ---- bot check only for a first report ----
  const { data: spot2 } = await admin.from("spots").insert({ area_id: area.id, name: `TEST GROWTH TWO ${Date.now()}`, status_flag: "approved", is_demo: true }).select("id").single();
  created.spot2 = spot2.id;
  const noToken = await call("/api/report", FRIEND.token, { spotId: spot2.id, status: "off" });
  check("bot check: someone who has already reported does not need a token (no graphics probing on their phone)", noToken.status === 200 && noToken.json.ok, JSON.stringify(noToken.json));
  const newcomer = await call("/api/report", OLD.token, { spotId: spot2.id, status: "off" });
  check("bot check: a first report WITHOUT a token is still refused (403)", newcomer.status === 403 && newcomer.json.error === "bot_check_failed", JSON.stringify(newcomer.json));

  // ---- follows (alerts) ----
  const f1 = await FRIEND.client.from("follows").insert({ user_id: FRIEND.id, spot_id: spot.id });
  check("follow: a person can follow a spot", !f1.error, JSON.stringify(f1.error));
  const peek = await INV.client.from("follows").select("spot_id").eq("user_id", FRIEND.id);
  check("follow: other people cannot see who follows what", (peek.data ?? []).length === 0);
  const sub = await FRIEND.client.from("push_subscriptions").insert({ user_id: FRIEND.id, endpoint: `https://example.invalid/push/${Date.now()}`, p256dh: "x", auth: "y" });
  check("push: a person can save their phone's push address", !sub.error, JSON.stringify(sub.error));
  const spy = await INV.client.from("push_subscriptions").select("endpoint");
  check("push: nobody can read other people's push addresses", (spy.data ?? []).length === 0);
  // a status change with a follower must not break the report (delivery to a fake address just fails quietly)
  await admin.from("follows").update({ alert_on_go: true, quiet_enabled: false }).eq("user_id", FRIEND.id);
  const r3 = await call("/api/report", INV.token, { spotId: spot.id, status: "on", turnstileToken: "XXXX.DUMMY.TOKEN.XXXX" });
  check("push: a report that changes status still succeeds with followers present", r3.status === 200 && r3.json.ok, JSON.stringify(r3.json));

  // ---- share card ----
  const card = await fetch(`${BASE}/api/card?spot=${spot.id}&lang=en`);
  check("card: a spot's picture is a PNG", card.status === 200 && /image\/png/.test(card.headers.get("content-type") ?? ""), String(card.status));
  const sq = await fetch(`${BASE}/api/card?spot=${spot.id}&square=1`);
  check("card: the square version works", sq.status === 200);
  const nothing = await fetch(`${BASE}/api/card?spot=not-a-real-id`);
  check("card: junk input still gives a picture, never an error", nothing.status === 200);
  const areaCard = await fetch(`${BASE}/api/card?area=${area.id}`);
  check("card: an area's picture works", areaCard.status === 200);

  // ---- link previews ----
  const html = await (await fetch(`${BASE}/spot/${spot.id}`)).text();
  check("preview: the spot page carries a preview picture", /og:image/.test(html) && html.includes("/api/card?spot="), html.slice(0, 0));
  check("preview: and a title naming the place", /Is there light in TEST GROWTH/.test(html));

  // ---- error log ----
  const tag = `TEST-ERR-${Date.now()}`;
  const logIt = (message) => fetch(`${BASE}/api/log-error`, { method: "POST", headers: { "content-type": "application/json", "user-agent": "Mozilla/5.0 (Linux; Android 13) Chrome/120 Mobile Safari/537.36" }, body: JSON.stringify(message === null ? { nope: 1 } : { message, stack: "Error: x\n at f (a.js:1:1)", path: "/spot/abc?ref=12345678" }) });
  check("errors: a junk report is refused (400)", (await logIt(null)).status === 400);
  check("errors: a crash report is accepted", (await logIt(`${tag} boom for person@example.com`)).status === 200);
  await logIt(`${tag} boom for person@example.com`);
  const { data: errRows } = await admin.from("client_errors").select("message,count,path,user_agent,source").like("message", `${tag}%`);
  check("errors: the same crash is grouped and counted (one row, count 2)", errRows?.length === 1 && errRows[0].count === 2, JSON.stringify(errRows));
  check("errors: emails are scrubbed, paths lose their query, phones are described briefly", errRows?.[0] && !errRows[0].message.includes("example.com") && errRows[0].path === "/spot/abc" && errRows[0].user_agent === "Chrome on Android mobile", JSON.stringify(errRows));
  const peekErr = await anon().from("client_errors").select("message").limit(1);
  check("errors: the public cannot read the error log", (peekErr.data ?? []).length === 0);
  const ADM = await makeTestUser("errsadm", created);
  await admin.from("profiles").update({ is_admin: true }).eq("id", ADM.id);
  const viewErrors = (token) => fetch(`${BASE}/api/admin?view=errors`, { headers: token ? { authorization: `Bearer ${token}` } : {} });
  check("errors: admin list refuses no sign-in (401)", (await viewErrors(null)).status === 401);
  check("errors: admin list refuses a normal user (403)", (await viewErrors(INV.token)).status === 403);
  const adminView = await viewErrors(ADM.token);
  const adminJson = await adminView.json();
  const mine = (adminJson.errors ?? []).find((e) => e.message.startsWith(tag));
  check("errors: an admin sees the grouped crash", adminView.status === 200 && !!mine && mine.count === 2, JSON.stringify(adminJson).slice(0, 200));
  const fixed = await fetch(`${BASE}/api/admin`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${ADM.token}` }, body: JSON.stringify({ action: "error.resolve", id: mine?.id, resolved: true }) });
  check("errors: an admin can mark it fixed", fixed.status === 200 && (await admin.from("client_errors").select("resolved").eq("id", mine.id).single()).data.resolved === true);
  await logIt(`${tag} boom for person@example.com`);
  check("errors: a repeat after 'fixed' reopens it", (await admin.from("client_errors").select("resolved,count").eq("id", mine.id).single()).data.resolved === false);
  await admin.from("client_errors").delete().like("message", `${tag}%`);
  await admin.from("rate_limit_hits").delete().like("key", "err:%");

  // ---- leaderboards are public but reveal only nicknames ----
  const lb = await anon().rpc("leaderboard_reporters", { p_limit: 5 });
  check("leaderboard: anyone can read it", !lb.error && Array.isArray(lb.data), JSON.stringify(lb.error));
  check("leaderboard: rows hold only nickname and numbers", (lb.data ?? []).every((r) => Object.keys(r).sort().join() === "nickname,points,streak,week_reports"));
  void url;
} catch (e) {
  console.error("TEST CRASHED:", e);
  failures++;
} finally {
  if (created.spot2) {
    for (const t of ["supply_sessions", "reports", "spot_status"]) await admin.from(t).delete().eq("spot_id", created.spot2);
    await admin.from("spots").delete().eq("id", created.spot2);
  }
  if (created.spot) {
    await admin.from("supply_sessions").delete().eq("spot_id", created.spot);
    await admin.from("reports").delete().eq("spot_id", created.spot);
    await admin.from("spot_status").delete().eq("spot_id", created.spot);
    await admin.from("spots").delete().eq("id", created.spot);
  }
  for (const id of created.users) await admin.auth.admin.deleteUser(id);
  console.log(failures ? `\n${failures} check(s) FAILED` : "\nAll checks passed. Test data cleaned up.");
  process.exit(failures ? 1 : 0);
}
