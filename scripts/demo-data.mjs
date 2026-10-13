// Fake-but-realistic data so you can see the app populated while testing.
// Everything it creates is marked is_demo (spots, reports, sessions) or named "demo-..." (devices), so it is
// completely separate from real data and easy to remove.
//
//   npm run demo:seed     adds 4 demo spots with a week of supply history and reports
//   npm run demo:clear    removes ALL demo data (run this before launch)
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error("Missing Supabase keys in .env.local"); process.exit(1); }
const db = createClient(url, key, { auth: { persistSession: false } });

const DAY = 86_400_000, HOUR = 3_600_000, LAGOS = HOUR;
const lagosDayStart = (ts) => Math.floor((ts + LAGOS) / DAY) * DAY - LAGOS;

// Four areas with different supply patterns: [area slug, spot name, DisCo code, band, avg light hours/day, reporters]
const DEMO = [
  ["maitama", "DEMO Maitama Crescent", "AEDC", "A", 18.5, 14],
  ["wuye", "DEMO Wuye Sunshine Estate", "AEDC", "A", 10.5, 9],
  ["lekki-phase-1", "DEMO Lekki Admiralty Way", "EKEDC", "B", 16.5, 6],
  ["surulere", "DEMO Surulere Bode Thomas", "IE", "D", 7, 2],
];

// A small repeatable random-number generator, so the demo looks the same every time.
function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// One day of supply: alternating light / no-light stretches adding up to roughly `lightH` hours of light.
function planDay(rand, lightH) {
  const light = Math.max(0, Math.min(24, lightH + (rand() - 0.5) * 5));
  const dark = 24 - light;
  const k = 2 + Math.floor(rand() * 3);                         // 2 to 4 power cuts
  const split = (total, n) => { const w = Array.from({ length: n }, () => 0.4 + rand()); const s = w.reduce((x, y) => x + y, 0); return w.map((x) => (x / s) * total); };
  const darks = split(dark, k), lights = split(light, k + 1);
  const out = [];
  for (let i = 0; i <= k; i++) {
    out.push({ status: rand() < 0.1 ? "weak" : "on", hours: lights[i] });
    if (i < k) out.push({ status: "off", hours: darks[i] });
  }
  return out;
}

async function clear() {
  const { data: spots } = await db.from("spots").select("id").eq("is_demo", true);
  const ids = (spots ?? []).map((s) => s.id);
  if (ids.length) await db.from("spots").delete().in("id", ids);          // cascades to status, sessions, reports
  await db.from("reports").delete().eq("is_demo", true);
  await db.from("supply_sessions").delete().eq("is_demo", true);
  await db.from("devices").delete().like("device_hash", "demo-%");
  console.log(`Removed ${ids.length} demo spot(s) and everything attached to them.`);
}

async function seed() {
  await clear();
  const now = Date.now();
  const { data: discos } = await db.from("discos").select("id,code");
  const disco = Object.fromEntries((discos ?? []).map((d) => [d.code, d.id]));

  for (const [i, [slug, name, discoCode, band, lightH, reporters]] of DEMO.entries()) {
    const { data: area } = await db.from("areas").select("id,name").eq("slug", slug).single();
    const { data: spot, error } = await db.from("spots")
      .insert({ area_id: area.id, name, band, disco_id: disco[discoCode] ?? null, status_flag: "approved", is_demo: true })
      .select("id").single();
    if (error) throw error;

    // Build 7 Lagos days of sessions, merging neighbours that share a status
    const rand = rng(1000 + i);
    const todayStart = lagosDayStart(now);
    const segs = [];
    for (let d = 6; d >= 0; d--) {
      let cursor = todayStart - d * DAY;
      for (const s of planDay(rand, lightH)) {
        const end = cursor + s.hours * HOUR;
        const last = segs[segs.length - 1];
        if (last && last.status === s.status && Math.abs(last.end - cursor) < 1000) last.end = end;
        else segs.push({ status: s.status, start: cursor, end });
        cursor = end;
      }
    }
    // Keep only what has already happened; the last stretch is the one still running
    const past = segs.filter((s) => s.start < now).map((s) => ({ ...s, end: Math.min(s.end, now) }));
    const current = past[past.length - 1];

    await db.from("supply_sessions").insert(past.map((s, idx) => {
      const open = idx === past.length - 1;
      return {
        spot_id: spot.id, status: s.status, started_at: new Date(s.start).toISOString(),
        ended_at: open ? null : new Date(s.end).toISOString(),
        last_confirmed_at: new Date(open ? now - 8 * 60_000 : s.end).toISOString(), is_demo: true,
      };
    }));

    // A pool of fake phones, and reports: one when each stretch began, plus confirmations during it
    const { data: devs } = await db.from("devices")
      .insert(Array.from({ length: reporters }, (_, n) => ({ device_hash: `demo-${i}-${n}` }))).select("id");
    const pick = (() => { let n = 0; return () => devs[n++ % devs.length].id; })();
    const reports = [];
    for (const s of past) {
      reports.push({ spot_id: spot.id, device_id: pick(), status: s.status, is_confirmation: false, weight: 1, created_at: new Date(s.start + rand() * 5 * 60_000).toISOString(), is_demo: true });
      for (let t = s.start + HOUR; t < s.end; t += HOUR * (0.7 + rand())) {
        reports.push({ spot_id: spot.id, device_id: pick(), status: s.status, is_confirmation: true, weight: 1, created_at: new Date(t).toISOString(), is_demo: true });
      }
    }
    // A recent confirmation so "recent activity" and the status are fresh
    reports.push({ spot_id: spot.id, device_id: pick(), status: current.status, is_confirmation: true, weight: 1, created_at: new Date(now - 8 * 60_000).toISOString(), is_demo: true });
    for (let n = 0; n < reports.length; n += 500) await db.from("reports").insert(reports.slice(n, n + 500));

    await db.from("spot_status").upsert({
      spot_id: spot.id, status: current.status, confidence: 0.8, since: new Date(current.start).toISOString(),
      last_report_at: new Date(now - 8 * 60_000).toISOString(), last_change_at: new Date(current.start).toISOString(),
      recent_reports: Math.min(reporters, 6), updated_at: new Date(now).toISOString(),
    });
    console.log(`  ${name} (${area.name}): ${past.length} supply stretches, ${reports.length} reports from ${reporters} phones, now "${current.status}"`);
  }
  console.log("Done. Remove it all later with: npm run demo:clear");
}

const cmd = process.argv[2];
if (cmd === "clear") await clear();
else if (cmd === "seed") await seed();
else { console.log("Usage: node scripts/demo-data.mjs seed|clear"); process.exit(1); }
