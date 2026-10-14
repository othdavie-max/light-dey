"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import enCommon from "@/i18n/en/common.json";
import enSpot from "@/i18n/en/spot.json";
import pcmCommon from "@/i18n/pcm/common.json";
import pcmSpot from "@/i18n/pcm/spot.json";
import { supabase, ensureSession } from "@/lib/supabase/browser";
import { useLang } from "@/lib/prefs";
import { computeStatus } from "@/lib/status/compute";
import { rollupArea, type AreaState } from "@/lib/status/rollup";
import { formatAgo } from "@/lib/format";
import type { SpotState } from "@/lib/status/types";

const dict = { en: { ...enCommon, ...enSpot }, pcm: { ...pcmCommon, ...pcmSpot } } as const;
const fmt = (s: string, v: Record<string, string>) => s.replace(/\{(\w+)\}/g, (_, k) => v[k] ?? "");

interface AreaSpot {
  id: string; name: string; isDefault: boolean; pending: boolean;
  row: { status: SpotState; since: Date | null; lastReportAt: Date | null };
}

const stateColor: Record<AreaState, string> = {
  mostly_on: "var(--ok)", mostly_off: "var(--off)", mixed: "var(--weak)", unknown: "var(--muted)",
};

export default function AreaPageClient({ id }: { id: number }) {
  const [lang] = useLang();
  const t = dict[lang];
  const a = t.area;
  const [area, setArea] = useState<{ name: string; city: string | null; lga: string; state: string } | null | undefined>(undefined);
  const [spots, setSpots] = useState<AreaSpot[]>([]);
  const [now, setNow] = useState(0);

  useEffect(() => {
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const timer = setInterval(tick, 30_000);
    return () => { clearTimeout(first); clearInterval(timer); };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const sb = supabase();
      await ensureSession();
      const [ar, sp] = await Promise.all([
        sb.from("areas").select("name,city,lgas(name,states(name))").eq("id", id).maybeSingle(),
        sb.from("spots").select("id,name,is_default,status_flag,spot_status(status,since,last_report_at)").eq("area_id", id).neq("status_flag", "rejected").order("is_default", { ascending: false }).order("name"),
      ]);
      if (cancelled) return;
      if (!ar.data) { setArea(null); return; }
      const l = ar.data.lgas as unknown as { name: string; states: { name: string } };
      setArea({ name: ar.data.name, city: ar.data.city, lga: l.name, state: l.states.name });
      setSpots((sp.data ?? []).map((s) => {
        const raw = s.spot_status as unknown as { status: SpotState; since: string | null; last_report_at: string | null } | { status: SpotState; since: string | null; last_report_at: string | null }[] | null;
        const ss = Array.isArray(raw) ? raw[0] : raw;
        return {
          id: s.id, name: s.name, isDefault: s.is_default, pending: s.status_flag === "pending",
          row: { status: ss?.status ?? "unknown", since: ss?.since ? new Date(ss.since) : null, lastReportAt: ss?.last_report_at ? new Date(ss.last_report_at) : null },
        };
      }));
    })();
    return () => { cancelled = true; };
  }, [id]);

  // Age each spot's stored status by the clock (stale -> unknown after long silence), then roll up.
  const aged = useMemo(() => spots.map((s) => ({ ...s, shown: computeStatus([], s.row, new Date(now || 0)) })), [spots, now]);
  const roll = useMemo(() => rollupArea(aged.map((s) => s.shown.status)), [aged]);

  if (area === null) {
    return (
      <main className="mx-auto max-w-md px-5 pt-6">
        <Link href="/" className="press panel inline-grid h-12 w-12 place-items-center rounded-full" aria-label={a.back}>←</Link>
        <p className="mt-8 text-muted">{t.spotPage.notFound}</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-md px-5 pb-16 pt-4">
      <header className="flex items-center gap-3">
        <Link href="/" className="press panel grid h-12 w-12 shrink-0 place-items-center rounded-full" aria-label={a.back}>←</Link>
        <div className="min-w-0">
          <h1 className="truncate text-[20px] font-medium leading-tight">{area ? fmt(a.title, { area: area.name }) : "…"}</h1>
          <p className="truncate text-sm text-muted">{area ? [area.city, area.lga, area.state].filter(Boolean).join(" · ") : ""}</p>
        </div>
      </header>

      <section className="panel mt-4 rounded-[28px] p-6 text-center">
        <p className="text-[36px] font-light leading-tight tracking-tight" style={{ color: stateColor[roll.state] }}>{a.state[roll.state]}</p>
        {roll.known > 0 && (
          <p className="mt-2 text-sm text-muted">{fmt(a.summary, { known: String(roll.known), total: String(roll.total), light: String(roll.light), off: String(roll.off) })}</p>
        )}
      </section>

      <ul className="mt-4 space-y-2">
        {aged.length === 0 && area && <li className="text-muted">{a.empty}</li>}
        {aged.map((s) => {
          const c = s.shown.status === "on" ? "var(--ok)" : s.shown.status === "weak" ? "var(--weak)" : s.shown.status === "off" ? "var(--off)" : "var(--muted)";
          return (
            <li key={s.id}>
              <Link href={`/spot/${s.id}`} className="press panel flex min-h-16 items-center justify-between gap-3 rounded-2xl px-4 py-2">
                <span className="min-w-0">
                  <span className="block truncate text-[16px] font-medium">{s.isDefault ? a.wholeArea : s.name}</span>
                  <span className="flex items-center gap-2 text-sm text-muted">
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: c }} />
                    {t.status[s.shown.status]}
                    {s.row.lastReportAt && now ? ` · ${formatAgo(now - s.row.lastReportAt.getTime())}` : ""}
                    {s.pending ? ` · ${a.pending}` : ""}
                  </span>
                </span>
                <span aria-hidden="true" className="text-muted">→</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </main>
  );
}
