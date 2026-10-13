"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import enCommon from "@/i18n/en/common.json";
import enSpot from "@/i18n/en/spot.json";
import pcmCommon from "@/i18n/pcm/common.json";
import pcmSpot from "@/i18n/pcm/spot.json";
import Bulb, { type Status } from "./Bulb";
import Timeline from "./Timeline";
import WeekChart from "./WeekChart";
import ConnectionStatus from "./ConnectionStatus";
import { supabase, ensureSession } from "@/lib/supabase/browser";
import { useLang } from "@/lib/prefs";
import { useSpotLive } from "@/lib/useSpotLive";
import { useReport } from "@/lib/useReport";
import { computeStatus } from "@/lib/status/compute";
import { lagosDayKey, lagosDayStart, summarisePeriod } from "@/lib/status/hours";
import { compareToBand, currentThresholds, type Band, type BandThreshold } from "@/lib/bands";
import { dataQuality } from "@/lib/quality";
import { formatAgo, formatDuration, formatHours, formatLagosTime } from "@/lib/format";
import type { ReportStatus } from "@/lib/status/types";

const dict = { en: { ...enCommon, ...enSpot }, pcm: { ...pcmCommon, ...pcmSpot } } as const;
const BANDS: Band[] = ["A", "B", "C", "D", "E"];

const fmt = (s: string, v: Record<string, string>) => s.replace(/\{(\w+)\}/g, (_, k) => v[k] ?? "");
const shortName = (n: string) => n.replace(/ \(whole area\)$/, "");
const one = (n: number) => String(Math.round(n * 10) / 10);

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="panel mt-4 rounded-[28px] p-5">
      <h2 className="mb-3 text-[17px] font-medium">{title}</h2>
      {children}
    </section>
  );
}

export default function SpotPageClient({ id }: { id: string }) {
  const [lang] = useLang();
  const t = dict[lang];
  const p = t.spotPage;
  const { loaded, spot, row, sessions, setRow } = useSpotLive(id);
  const { report, busy, message, turnstileBox, pending } = useReport({ spot, row, setRow, t });

  const [now, setNow] = useState(0);
  const [thresholds, setThresholds] = useState<Partial<Record<Band, number>>>({});
  const [thresholdDate, setThresholdDate] = useState<string | null>(null);
  const [counts, setCounts] = useState<{ reporters: number } | null>(null);
  const [activity, setActivity] = useState<{ status: ReportStatus; created_at: string }[]>([]);
  const [bandPick, setBandPick] = useState<Band | null>(null);
  const [bandState, setBandState] = useState<"idle" | "saving" | "saved">("idle");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const timer = setInterval(tick, 30_000);
    return () => { clearTimeout(first); clearInterval(timer); };
  }, []);

  // Facts that are not "live": the band promises, how many people reported, and the latest activity
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const sb = supabase();
      await ensureSession();
      const weekStart = new Date(lagosDayStart(new Date()).getTime() - 6 * 86_400_000).toISOString();
      const [bands, cnt, act] = await Promise.all([
        sb.from("band_thresholds").select("band,min_hours_per_day,effective_date"),
        sb.rpc("spot_report_counts", { p_spot_id: id, p_since: weekStart }),
        sb.from("recent_activity").select("status,created_at").eq("spot_id", id).order("created_at", { ascending: false }).limit(3),
      ]);
      if (cancelled) return;
      const rows: BandThreshold[] = (bands.data ?? []).map((b) => ({ band: b.band as Band, minHoursPerDay: Number(b.min_hours_per_day), effectiveDate: b.effective_date }));
      setThresholds(currentThresholds(rows, lagosDayKey(new Date())));
      setThresholdDate(rows.map((r) => r.effectiveDate).sort().pop() ?? null);
      const c = (cnt.data as { reporter_count: number }[] | null)?.[0];
      setCounts({ reporters: c?.reporter_count ?? 0 });
      setActivity((act.data ?? []) as { status: ReportStatus; created_at: string }[]);
    })();
    return () => { cancelled = true; };
  }, [id]);

  const nowDate = useMemo(() => new Date(now || 0), [now]);
  const shown = useMemo(() => computeStatus([], row, nowDate), [row, nowDate]);
  const bulb: Status = shown.status === "mixed" ? "unknown" : shown.status;
  useEffect(() => { document.body.dataset.status = bulb; }, [bulb]);

  const week = useMemo(() => (now ? summarisePeriod(sessions, nowDate, 7) : null), [sessions, nowDate, now]);
  const band = (spot?.band ?? null) as Band | null;
  const check = useMemo(
    () => (band && week ? compareToBand(band, week.avgLightHoursPerDay, thresholds, { reporters: counts?.reporters ?? 0, coverage: week.coverage }) : null),
    [band, week, thresholds, counts],
  );
  const quality = week && counts ? dataQuality(counts.reporters, week.coverage) : null;
  const promised = band ? thresholds[band] ?? null : null;

  async function saveBand() {
    if (!spot || !bandPick) return;
    setBandState("saving");
    try {
      const token = await ensureSession();
      await fetch("/api/spot-attributes", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token ?? ""}` },
        body: JSON.stringify({ spotId: spot.id, band: bandPick }),
      });
    } catch { /* shown as saved either way; the admin queue is best-effort */ }
    setBandState("saved");
  }

  async function share() {
    const url = window.location.href;
    const text = fmt(p.shareText, { area: spot?.areaName ?? "" });
    try {
      if (navigator.share) { await navigator.share({ title: "Light Dey?", text, url }); return; }
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch { /* the person closed the share sheet */ }
  }

  // ---- words ----
  const duration = row.since && now ? formatDuration(now - row.since.getTime()) : "";
  const time = row.since ? formatLagosTime(row.since) : "";
  let sinceText = loaded ? fmt(t.since[shown.status], { duration, time }) : t.since.loading;
  if (loaded && shown.stale && shown.status !== "unknown" && shown.status !== "mixed" && row.lastReportAt && now) {
    sinceText = fmt(t.since.stale, { ago: formatAgo(now - row.lastReportAt.getTime()) });
  }
  const dot = shown.status === "on" ? "var(--ok)" : shown.status === "weak" ? "var(--weak)" : "var(--off)";
  const title = spot ? shortName(spot.name) : "…";
  const subline = spot ? [spot.city, spot.lga, spot.disco, spot.band ? `Band ${spot.band}` : null].filter(Boolean).join(" · ") : "";
  const word = t.status[shown.status];

  if (loaded && !spot) {
    return (
      <main className="mx-auto max-w-md px-5 pt-6">
        <Link href="/" className="press panel inline-grid h-12 w-12 place-items-center rounded-full" aria-label={p.back}>←</Link>
        <p className="mt-8 text-muted">{p.notFound}</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-md px-5 pb-16 pt-4">
      <header className="flex items-center gap-3">
        <Link href="/" className="press panel grid h-12 w-12 shrink-0 place-items-center rounded-full" aria-label={p.back}>←</Link>
        <div className="min-w-0">
          <h1 className="truncate text-[20px] font-medium leading-tight">{title}</h1>
          <p className="truncate text-sm text-muted">{subline}</p>
        </div>
      </header>

      <ConnectionStatus
        offlineText={t.offline.banner}
        waitingText={pending > 0 ? fmt(pending === 1 ? t.offline.waiting : t.offline.waitingMany, { n: String(pending) }) : null}
      />

      {/* Live status */}
      <section className="panel mt-4 flex items-center gap-3 rounded-[28px] p-4">
        <div className="h-[150px] w-[112px] shrink-0" aria-hidden="true">
          <div className="origin-top-left scale-[.54]"><Bulb status={bulb} /></div>
        </div>
        <div className="min-w-0">
          <p className={`font-light leading-[1.05] tracking-tight ${word.length > 12 ? "text-[28px]" : "text-[38px]"}`}>{word}</p>
          <p className="mt-2 flex items-start gap-2 text-sm text-muted" aria-live="polite">
            <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: dot, boxShadow: `0 0 8px ${dot}` }} />
            {sinceText}
          </p>
        </div>
      </section>

      {/* Report */}
      <section className="panel mt-4 rounded-[28px] p-3">
        <div className="grid grid-cols-2 gap-3">
          <button disabled={busy || !spot} onClick={() => report("on")} className="press min-h-[72px] rounded-[22px] text-[16px] font-semibold disabled:opacity-60" style={{ background: "linear-gradient(180deg,#ffd75e,#ffbf24)", color: "var(--on-text)", boxShadow: "0 8px 24px -8px rgba(255,190,40,.55), inset 0 1px 0 rgba(255,255,255,.5)" }}>
            {t.buttons.on}
          </button>
          <button disabled={busy || !spot} onClick={() => report("off")} className="press panel min-h-[72px] rounded-[22px] text-[16px] font-semibold disabled:opacity-60" style={{ background: "var(--panel-strong)" }}>
            {t.buttons.off}
          </button>
        </div>
        <button disabled={busy || !spot} onClick={() => report("weak")} className="press mt-3 min-h-12 w-full rounded-2xl text-[15px] font-semibold text-weak disabled:opacity-60" style={{ border: "1px solid color-mix(in srgb, var(--weak) 45%, transparent)", background: "color-mix(in srgb, var(--weak) 8%, transparent)" }}>
          ⚡ {t.buttons.weak}
        </button>
      </section>
      <p className="mt-3 min-h-6 text-center text-sm text-muted" role="status">{message}</p>

      {/* Today */}
      <Section title={p.today}>
        {now > 0 && <Timeline sessions={sessions} now={nowDate} legend={p.legend} summary={(light) => fmt(p.todaySummary, { light })} />}
        {week && (() => {
          const today = week.perDay[week.perDay.length - 1];
          return today && today.lightHours + (today.totals.off / 60) > 0
            ? <p className="mt-3 text-sm text-muted">{fmt(p.todaySummary, { light: formatHours(today.lightHours) })}</p>
            : <p className="mt-3 text-sm text-muted">{p.todayEmpty}</p>;
        })()}
      </Section>

      {/* This week */}
      <Section title={p.week}>
        {week && week.perDay.some((d) => d.lightHours > 0 || d.totals.off > 0) ? (
          <>
            <WeekChart days={week.perDay} promised={promised} promiseLabel={band ? fmt(p.weekPromise, { band }) : ""} todayKey={lagosDayKey(nowDate)} />
            <p className="mt-4 text-[15px]">{fmt(p.weekTotal, { hours: formatHours(week.totalLightHours) })}</p>
            {week.avgLightHoursPerDay !== null && <p className="text-sm text-muted">{fmt(p.weekAvg, { hours: formatHours(week.avgLightHoursPerDay) })}</p>}
          </>
        ) : (
          <p className="text-muted">{p.weekEmpty}</p>
        )}
      </Section>

      {/* Band check */}
      <Section title={p.band}>
        {band && promised !== null ? (
          <div className="space-y-2 text-[15px]">
            <p>{fmt(p.bandIs, { band, promised: one(promised) })}</p>
            {check ? (
              <>
                <p>{fmt(p.bandActual, { actual: one(check.actualHours) })}</p>
                <p className="font-medium" style={{ color: check.meets ? "var(--ok)" : "var(--weak)" }}>
                  {check.meets ? p.bandMeets : fmt(p.bandShort, { gap: one(Math.abs(check.gapHours)) })}
                </p>
                {check.lowConfidence && <p className="text-sm text-muted">{p.bandLow}</p>}
              </>
            ) : (
              <p className="text-muted">{p.weekEmpty}</p>
            )}
            {thresholdDate && <p className="pt-1 text-xs text-muted">{fmt(p.bandNote, { date: thresholdDate })}</p>}
          </div>
        ) : (
          <div>
            <p className="text-muted">{p.bandUnknown}</p>
            {bandState === "saved" ? (
              <p className="mt-3" role="status">{p.bandThanks}</p>
            ) : (
              <>
                <p className="mt-3 text-[15px]">{p.bandAsk}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {BANDS.map((b) => (
                    <button key={b} onClick={() => setBandPick(bandPick === b ? null : b)} aria-pressed={bandPick === b} className="press min-h-12 rounded-full px-4 text-[15px] font-medium"
                      style={bandPick === b ? { background: "linear-gradient(180deg,#ffd75e,#ffbf24)", color: "var(--on-text)" } : { background: "var(--panel-strong)", border: "1px solid var(--panel-border)" }}>
                      {b}
                    </button>
                  ))}
                </div>
                <button disabled={!bandPick || bandState === "saving"} onClick={saveBand} className="press mt-3 min-h-12 rounded-2xl px-6 text-[15px] font-semibold disabled:opacity-50" style={{ background: "var(--panel-strong)", border: "1px solid var(--panel-border)" }}>
                  {p.bandSave}
                </button>
              </>
            )}
          </div>
        )}
      </Section>

      {/* Recent activity */}
      <Section title={p.activity}>
        {activity.length === 0 ? (
          <p className="text-muted">{fmt(p.activityNone, { area: spot?.areaName ?? "" })}</p>
        ) : (
          <ul className="space-y-2 text-[15px]">
            {activity.map((a, i) => (
              <li key={i}>{fmt(p.activityLine, { area: spot?.areaName ?? "", status: p.activityStatus[a.status], ago: formatAgo(Math.max(0, now - new Date(a.created_at).getTime())) })}</li>
            ))}
          </ul>
        )}
      </Section>

      {/* Data quality */}
      <Section title={p.quality}>
        {quality && counts && week ? (
          <div className="space-y-1.5 text-[15px]">
            <p className="inline-block rounded-full px-3 py-1 text-sm font-medium" style={{ background: "var(--panel-strong)", border: "1px solid var(--panel-border)", color: quality === "good" ? "var(--ok)" : quality === "ok" ? "var(--text)" : "var(--weak)" }}>
              {p.levels[quality]}
            </p>
            <p>{counts.reporters === 0 ? p.qualityNone : counts.reporters === 1 ? p.qualityOne : fmt(p.qualityReporters, { n: String(counts.reporters) })}</p>
            <p className="text-sm text-muted">{fmt(p.qualityCoverage, { pct: String(Math.round(week.coverage * 100)) })}</p>
          </div>
        ) : (
          <p className="text-muted">…</p>
        )}
      </Section>

      {/* Follow / share */}
      <div className="mt-4 grid grid-cols-2 gap-3">
        <button disabled title={p.followSoon} className="press panel min-h-14 rounded-2xl text-[16px] font-medium opacity-60">🔔 {p.follow}</button>
        <button onClick={share} className="press panel min-h-14 rounded-2xl text-[16px] font-medium">{copied ? p.copied : `↗ ${p.share}`}</button>
      </div>
      <p className="mt-2 text-center text-xs text-muted">{p.followSoon}</p>

      {spot && (
        <Link href={`/area/${spot.areaId}`} className="press panel mt-4 flex min-h-14 items-center justify-between rounded-2xl px-5 text-[15px] font-medium">
          {fmt(p.allSpots, { area: spot.areaName })}
          <span aria-hidden="true" className="text-muted">→</span>
        </Link>
      )}

      <div ref={turnstileBox} className="mt-4 flex justify-center" />
    </main>
  );
}
