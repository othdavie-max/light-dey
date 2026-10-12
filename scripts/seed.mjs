// Loads the location hierarchy, DisCos, band thresholds and badges from data/seed/*.json into Supabase.
// Safe to run again: existing rows are updated, not duplicated.
// Run with:  npm run seed
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}
const sb = createClient(url, key, { auth: { persistSession: false } });

const read = (f) => JSON.parse(readFileSync(new URL(`../data/seed/${f}`, import.meta.url), "utf8"));
const slugify = (s) =>
  s.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

async function upsert(table, rows, onConflict) {
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await sb.from(table).upsert(rows.slice(i, i + 500), { onConflict });
    if (error) throw new Error(`${table}: ${error.message}`);
  }
  console.log(`  ${table}: ${rows.length} rows`);
}
async function fetchAll(table, columns) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from(table).select(columns).range(from, from + 999);
    if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...data);
    if (data.length < 1000) return out;
  }
}

console.log("Seeding Light Dey? reference data...");

// States
const stateNames = read("states.json");
await upsert("states", stateNames.map((name) => ({ name, slug: slugify(name) })), "slug");
const states = await fetchAll("states", "id,slug");
const stateId = new Map(states.map((s) => [s.slug, s.id]));

// LGAs
const lgaJson = read("lgas.json");
const lgaRows = Object.entries(lgaJson).flatMap(([state, names]) => {
  const id = stateId.get(slugify(state));
  if (!id) throw new Error(`Unknown state in lgas.json: ${state}`);
  return names.map((name) => ({ state_id: id, name, slug: slugify(name) }));
});
await upsert("lgas", lgaRows, "state_id,slug");
const lgas = await fetchAll("lgas", "id,state_id,slug");
const lgaId = new Map(lgas.map((l) => [`${l.state_id}:${l.slug}`, l.id]));

// Areas
const { entries } = read("areas.json");
const areaRows = entries.flatMap((e) => {
  const sid = stateId.get(slugify(e.state));
  const lid = lgaId.get(`${sid}:${slugify(e.lga)}`);
  if (!lid) throw new Error(`Unknown LGA in areas.json: ${e.state} / ${e.lga}`);
  return e.areas.map((name) => ({ lga_id: lid, name, slug: slugify(name), city: e.city ?? null }));
});
await upsert("areas", areaRows, "lga_id,slug");

// One automatic "whole area" spot per area, so there is always something to report on
const areas = await fetchAll("areas", "id,name");
await upsert(
  "spots",
  areas.filter((a) => areaRows.some((r) => r.name === a.name)).map((a) => ({
    area_id: a.id, name: `${a.name} (whole area)`, status_flag: "approved", is_default: true,
  })),
  "area_id,name",
);

// DisCos
await upsert("discos", read("discos.json").map((d) => ({ ...d, slug: slugify(d.code) })), "code");

// Band thresholds
const b = read("bands.json");
await upsert(
  "band_thresholds",
  Object.entries(b.bands).map(([band, hours]) => ({
    band, min_hours_per_day: hours, effective_date: b.effective_date, source_note: b.source_note,
  })),
  "band,effective_date",
);

// Badges
await upsert("badges", read("badges.json"), "code");

console.log("Done.");
