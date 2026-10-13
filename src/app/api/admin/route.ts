// /api/admin: everything the admin page needs. EVERY request is checked on the server:
// the caller must hold a real (non-anonymous) sign-in AND be marked is_admin in the database.
// The browser never talks to admin data directly. Every change is written to the audit log.
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { adminClient } from "@/lib/supabase/admin";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BANDS = ["A", "B", "C", "D", "E"];
const DATE = /^\d{4}-\d{2}-\d{2}$/;

const json = (body: Record<string, unknown>, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
const bad = (error: string, status = 400) => json({ ok: false, error }, status);

type Authed = { ok: true; db: SupabaseClient; adminId: string } | { ok: false; res: NextResponse };

async function authorise(req: Request): Promise<Authed> {
  const db = adminClient();
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return { ok: false, res: bad("not_signed_in", 401) };
  const { data } = await db.auth.getUser(token);
  const user = data?.user;
  if (!user || user.is_anonymous) return { ok: false, res: bad("not_signed_in", 401) };
  const { data: profile } = await db.from("profiles").select("is_admin,is_banned").eq("id", user.id).maybeSingle();
  if (!profile?.is_admin || profile.is_banned) return { ok: false, res: bad("not_an_admin", 403) };
  return { ok: true, db, adminId: user.id };
}

async function audit(db: SupabaseClient, adminId: string, action: string, targetType: string, targetId: string, details?: unknown) {
  await db.from("admin_audit").insert({ admin_id: adminId, action, target_type: targetType, target_id: targetId, details: details ?? null });
}

const isUuid = (v: unknown): v is string => typeof v === "string" && UUID.test(v);
const cleanText = (v: unknown, min: number, max: number): string | null => {
  if (typeof v !== "string") return null;
  const s = v.replace(/[\u0000-\u001f]/g, "").replace(/\s+/g, " ").trim();
  return s.length >= min && s.length <= max ? s : null;
};

// ------------------------------------------------------------------ reading
export async function GET(req: Request) {
  const a = await authorise(req);
  if (!a.ok) return a.res;
  const { db } = a;
  const url = new URL(req.url);
  const view = url.searchParams.get("view") ?? "overview";
  const demo = url.searchParams.get("demo") === "1";
  const q = (url.searchParams.get("q") ?? "").replace(/[%_,()]/g, " ").trim().slice(0, 60);

  if (view === "overview") {
    const [ov, log] = await Promise.all([
      db.rpc("admin_overview", { p_include_demo: demo }),
      db.from("admin_audit").select("id,action,target_type,target_id,details,created_at,admin_id").order("created_at", { ascending: false }).limit(10),
    ]);
    if (ov.error) return bad("could_not_load", 500);
    const ids = [...new Set((log.data ?? []).map((l) => l.admin_id).filter(Boolean))];
    const { data: names } = ids.length ? await db.from("profiles").select("id,nickname").in("id", ids) : { data: [] };
    const nick = new Map((names ?? []).map((n) => [n.id, n.nickname]));
    return json({ ok: true, overview: ov.data, audit: (log.data ?? []).map((l) => ({ ...l, admin: nick.get(l.admin_id) ?? "admin" })) });
  }

  if (view === "spots") {
    let query = db.from("spots")
      .select("id,name,band,disco_id,status_flag,is_demo,is_default,created_at,created_by,merged_into,areas(id,name,city,lgas(name,states(name)))")
      .order("created_at", { ascending: false }).limit(q ? 20 : 100);
    query = q ? query.ilike("name", `%${q}%`) : query.eq("status_flag", "pending");
    if (!demo) query = query.eq("is_demo", false);
    const { data, error } = await query;
    if (error) return bad("could_not_load", 500);
    const spots = data ?? [];
    const creators = [...new Set(spots.map((s) => s.created_by).filter(Boolean))];
    const { data: profs } = creators.length ? await db.from("profiles").select("id,nickname,trust_score,is_banned").in("id", creators) : { data: [] };
    const byId = new Map((profs ?? []).map((p) => [p.id, p]));
    // Possible duplicates for each pending spot: similar names in the same area
    const withSimilar = await Promise.all(spots.map(async (s) => {
      const area = s.areas as unknown as { id: number } | null;
      let similar: { id: string; name: string; similarity: number }[] = [];
      if (!q && area) {
        const { data: sim } = await db.rpc("similar_spots", { p_area_id: area.id, p_name: s.name });
        similar = ((sim ?? []) as { id: string; name: string; similarity: number }[]).filter((x) => x.id !== s.id);
      }
      return { ...s, creator: s.created_by ? byId.get(s.created_by) ?? null : null, similar };
    }));
    return json({ ok: true, spots: withSimilar });
  }

  if (view === "flags") {
    const { data, error } = await db.from("flags").select("id,kind,target_type,target_id,reason,details,status,created_at,created_by").eq("status", "open").order("created_at").limit(100);
    if (error) return bad("could_not_load", 500);
    const flags = data ?? [];
    const spotIds = flags.filter((f) => f.target_type === "spot" && isUuid(f.target_id)).map((f) => f.target_id);
    const userIds = [...flags.filter((f) => f.target_type === "user" && isUuid(f.target_id)).map((f) => f.target_id), ...flags.map((f) => f.created_by).filter(Boolean)];
    const [{ data: spots }, { data: users }] = await Promise.all([
      spotIds.length ? db.from("spots").select("id,name,band,disco_id,areas(name,city)").in("id", spotIds) : Promise.resolve({ data: [] }),
      userIds.length ? db.from("profiles").select("id,nickname").in("id", userIds) : Promise.resolve({ data: [] }),
    ]);
    const sMap = new Map((spots ?? []).map((s) => [s.id, s]));
    const uMap = new Map((users ?? []).map((u) => [u.id, u.nickname]));
    return json({ ok: true, flags: flags.map((f) => ({ ...f, spot: f.target_type === "spot" ? sMap.get(f.target_id) ?? null : null, subject: f.target_type === "user" ? uMap.get(f.target_id) ?? null : null, reporter: f.created_by ? uMap.get(f.created_by) ?? null : null })) });
  }

  if (view === "reporters") {
    const days = Math.min(90, Math.max(1, Number(url.searchParams.get("days")) || 7));
    const { data, error } = await db.rpc("admin_reporters", { p_days: days, p_include_demo: demo });
    if (error) return bad("could_not_load", 500);
    return json({ ok: true, days, reporters: data ?? [] });
  }

  if (view === "reference") {
    const [discos, bands, areas] = await Promise.all([
      db.from("discos").select("id,name,code,is_active").order("code"),
      db.from("band_thresholds").select("id,band,min_hours_per_day,effective_date,source_note").order("band").order("effective_date", { ascending: false }),
      q ? db.from("areas").select("id,name,city,lat,lng,lgas(name,states(name))").ilike("name", `%${q}%`).order("name").limit(20) : Promise.resolve({ data: [] }),
    ]);
    return json({ ok: true, discos: discos.data ?? [], bands: bands.data ?? [], areas: areas.data ?? [] });
  }

  return bad("unknown_view");
}

// ------------------------------------------------------------------ changing
export async function POST(req: Request) {
  const a = await authorise(req);
  if (!a.ok) return a.res;
  const { db, adminId } = a;

  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return bad("bad_request"); }
  const action = b.action;

  switch (action) {
    case "spot.approve":
    case "spot.reject": {
      if (!isUuid(b.id)) return bad("bad_request");
      const status = action === "spot.approve" ? "approved" : "rejected";
      const { data, error } = await db.from("spots").update({ status_flag: status }).eq("id", b.id).in("status_flag", ["pending", "approved", "rejected"]).select("id,name").maybeSingle();
      if (error || !data) return bad("not_found", 404);
      await audit(db, adminId, action, "spot", b.id, { name: data.name });
      return json({ ok: true });
    }

    case "spot.update": {
      if (!isUuid(b.id)) return bad("bad_request");
      const update: Record<string, unknown> = {};
      if (b.name !== undefined) {
        const name = cleanText(b.name, 3, 60);
        if (!name) return bad("bad_name");
        update.name = name;
      }
      if (b.band !== undefined) {
        if (b.band !== null && !BANDS.includes(b.band as string)) return bad("bad_band");
        update.band = b.band;
      }
      if (b.discoId !== undefined) {
        if (b.discoId !== null && !(Number.isInteger(b.discoId) && (b.discoId as number) >= 1 && (b.discoId as number) <= 32767)) return bad("bad_disco");
        update.disco_id = b.discoId;
      }
      if (Object.keys(update).length === 0) return bad("nothing_to_change");
      const { data, error } = await db.from("spots").update(update).eq("id", b.id).select("id").maybeSingle();
      if (error?.code === "23505") return bad("name_taken", 409);
      if (error?.code === "23503") return bad("bad_disco");
      if (error || !data) return bad("not_found", 404);
      await audit(db, adminId, action, "spot", b.id, update);
      return json({ ok: true });
    }

    case "spot.merge": {
      if (!isUuid(b.fromId) || !isUuid(b.intoId)) return bad("bad_request");
      const { error } = await db.rpc("merge_spots", { p_from: b.fromId, p_into: b.intoId });
      if (error) return bad(error.message.slice(0, 120), 400);
      await audit(db, adminId, action, "spot", b.fromId, { into: b.intoId });
      return json({ ok: true });
    }

    case "flag.resolve": {
      if (typeof b.id !== "number" || !Number.isInteger(b.id)) return bad("bad_request");
      if (b.status !== "resolved" && b.status !== "dismissed") return bad("bad_request");
      const { data: flag } = await db.from("flags").select("id,kind,target_type,target_id,details,status").eq("id", b.id).maybeSingle();
      if (!flag || flag.status !== "open") return bad("not_found", 404);

      // "Undo": take back a suggested DisCo/band, but only where the spot still has exactly what was suggested
      let undone: string[] = [];
      if (b.undo === true && flag.kind === "attributes" && flag.target_type === "spot" && isUuid(flag.target_id) && flag.details) {
        const d = flag.details as { disco_id?: number; band?: string };
        const { data: spot } = await db.from("spots").select("disco_id,band").eq("id", flag.target_id).maybeSingle();
        const clear: Record<string, null> = {};
        if (spot && d.disco_id !== undefined && spot.disco_id === d.disco_id) clear.disco_id = null;
        if (spot && d.band !== undefined && spot.band === d.band) clear.band = null;
        if (Object.keys(clear).length) { await db.from("spots").update(clear).eq("id", flag.target_id); undone = Object.keys(clear); }
      }
      await db.from("flags").update({ status: b.status, resolved_by: adminId }).eq("id", b.id);
      await audit(db, adminId, action, "flag", String(b.id), { status: b.status, undone });
      return json({ ok: true, undone });
    }

    case "user.ban":
    case "user.unban": {
      if (!isUuid(b.id)) return bad("bad_request");
      if (b.id === adminId) return bad("cannot_ban_yourself");
      const { data: target } = await db.from("profiles").select("id,is_admin").eq("id", b.id).maybeSingle();
      if (!target) return bad("not_found", 404);
      if (target.is_admin) return bad("cannot_ban_an_admin");
      await db.from("profiles").update({ is_banned: action === "user.ban" }).eq("id", b.id);
      // Close any open flags about this person
      if (action === "user.ban") await db.from("flags").update({ status: "resolved", resolved_by: adminId }).eq("target_type", "user").eq("target_id", b.id).eq("status", "open");
      await audit(db, adminId, action, "user", b.id, { reason: cleanText(b.reason, 1, 200) });
      return json({ ok: true });
    }

    case "user.resetTrust": {
      if (!isUuid(b.id)) return bad("bad_request");
      await db.from("profiles").update({ trust_score: 1 }).eq("id", b.id);
      await audit(db, adminId, action, "user", b.id);
      return json({ ok: true });
    }

    case "disco.upsert": {
      const name = cleanText(b.name, 3, 80);
      const code = typeof b.code === "string" ? b.code.trim().toUpperCase() : "";
      if (!name || !/^[A-Z0-9]{2,12}$/.test(code)) return bad("bad_request");
      const row = { name, code, slug: code.toLowerCase(), is_active: b.isActive !== false };
      if (b.id !== undefined && !(Number.isInteger(b.id) && (b.id as number) >= 1 && (b.id as number) <= 32767)) return bad("bad_request");
      const result = Number.isInteger(b.id)
        ? await db.from("discos").update(row).eq("id", b.id as number).select("id").maybeSingle()
        : await db.from("discos").insert(row).select("id").maybeSingle();
      if (result.error?.code === "23505") return bad("code_taken", 409);
      if (result.error || !result.data) return bad("could_not_save", 500);
      await audit(db, adminId, action, "disco", String(result.data.id), row);
      return json({ ok: true, id: result.data.id });
    }

    case "band.add": {
      const hours = Number(b.minHoursPerDay);
      if (!BANDS.includes(b.band as string) || !Number.isFinite(hours) || hours < 0 || hours > 24) return bad("bad_request");
      if (typeof b.effectiveDate !== "string" || !DATE.test(b.effectiveDate) || Number.isNaN(Date.parse(b.effectiveDate))) return bad("bad_date");
      const row = { band: b.band as string, min_hours_per_day: hours, effective_date: b.effectiveDate, source_note: cleanText(b.sourceNote, 1, 300) };
      const { data, error } = await db.from("band_thresholds").insert(row).select("id").maybeSingle();
      if (error?.code === "23505") return bad("already_exists_for_that_date", 409);
      if (error || !data) return bad("could_not_save", 500);
      await audit(db, adminId, action, "band", String(data.id), row);
      return json({ ok: true, id: data.id });
    }

    case "area.update": {
      if (typeof b.id !== "number" || !Number.isInteger(b.id)) return bad("bad_request");
      const update: Record<string, unknown> = {};
      if (b.name !== undefined) { const n = cleanText(b.name, 2, 80); if (!n) return bad("bad_name"); update.name = n; }
      if (b.city !== undefined) { if (b.city !== null) { const c = cleanText(b.city, 2, 60); if (!c) return bad("bad_city"); update.city = c; } else update.city = null; }
      for (const [k, lo, hi] of [["lat", -90, 90], ["lng", -180, 180]] as const) {
        if (b[k] === undefined) continue;
        if (b[k] === null) { update[k] = null; continue; }
        const n = Number(b[k]);
        if (!Number.isFinite(n) || n < lo || n > hi) return bad(`bad_${k}`);
        update[k] = Math.round(n * 100000) / 100000;
      }
      if (Object.keys(update).length === 0) return bad("nothing_to_change");
      const { data, error } = await db.from("areas").update(update).eq("id", b.id).select("id").maybeSingle();
      if (error?.code === "23505") return bad("name_taken", 409);
      if (error || !data) return bad("not_found", 404);
      await audit(db, adminId, action, "area", String(b.id), update);
      return json({ ok: true });
    }

    default:
      return bad("unknown_action");
  }
}
