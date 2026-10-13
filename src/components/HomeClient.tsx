"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import en from "@/i18n/en.json";
import pcm from "@/i18n/pcm.json";
import Bulb, { type Status } from "./Bulb";
import { supabase, ensureSession, deviceId } from "@/lib/supabase/browser";
import { useTurnstile } from "@/lib/useTurnstile";
import { computeStatus } from "@/lib/status/compute";
import { dailyTotals, lagosDayStart } from "@/lib/status/hours";
import type { ReportStatus, SpotState, SupplySession } from "@/lib/status/types";
import { formatAgo, formatDuration, formatLagosTime } from "@/lib/format";
import { appConfig } from "../../config/app.config";

const dict = { en, pcm } as const;
type Lang = keyof typeof dict;

// TEMPORARY until onboarding exists (next step): everyone starts on Wuye, Abuja.
const DEFAULT_SPOT_NAME = "Wuye (whole area)";

interface SpotInfo { id: string; name: string; city: string | null; disco: string | null; band: string | null }
interface StatusRow { status: SpotState; since: Date | null; lastReportAt: Date | null }

function fmt(s: string, vars: Record<string, string>) {
  return s.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? "");
}

const Icon = {
  home: <path d="M4 11l8-7 8 7v8a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z" />,
  search: <><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4.5 4.5" /></>,
  board: <path d="M5 20V11M12 20V4M19 20v-6" />,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4.5 20c.8-4 3.8-6 7.5-6s6.7 2 7.5 6" /></>,
  chevron: <path d="M6 9l6 6 6-6" />,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6L7 7M17 17l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4" /></>,
  moon: <path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z" />,
  bulbOn: <><path d="M9 18h6M10 21h4" /><path d="M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z" /></>,
  bulbOff: <><path d="M9 18h6M10 21h4" /><path d="M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z" /><path d="M4 4l16 16" /></>,
  bolt: <path d="M13 3L5 13.5h6L10 21l8-10.5h-6z" />,
  clock: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>,
  flame: <path d="M12 3c1 3.5 5 5.5 5 10a5 5 0 0 1-10 0c0-2 1-3 2-4 .3 1.5 1 2 1.5 2C10.5 8.5 11 6 12 3z" />,
  star: <path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.8l-5.2 2.8 1-5.8L3.5 9.7l5.9-.8z" />,
};

function Ico({ d, size = 22 }: { d: React.ReactNode; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {d}
    </svg>
  );
}

export default function HomeClient() {
  const [lang, setLang] = useState<Lang>("pcm");
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [spot, setSpot] = useState<SpotInfo | null>(null);
  const [row, setRow] = useState<StatusRow>({ status: "unknown", since: null, lastReportAt: null });
  const [sessions, setSessions] = useState<SupplySession[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [now, setNow] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [streak, setStreak] = useState(0);
  const [points, setPoints] = useState(0);
  const t = dict[lang];
  const { box: turnstileBox, getToken } = useTurnstile(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || appConfig.turnstileSiteKey);

  // A ticking clock (updated from timers, never during render)
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, 30_000);
    return () => { clearTimeout(first); clearInterval(id); };
  }, []);

  useEffect(() => { document.documentElement.dataset.theme = theme; }, [theme]);

  // Load the spot, its status, today's sessions and the person's points. Then listen for live changes.
  useEffect(() => {
    const sb = supabase();
    let channel: ReturnType<typeof sb.channel> | null = null;
    let cancelled = false;

    (async () => {
      const token = await ensureSession();
      const { data: u } = await sb.auth.getUser();

      let spotId: string | null = null;
      try { spotId = localStorage.getItem("ld_spot"); } catch { /* storage blocked: fall back to default */ }
      if (!spotId) {
        const { data } = await sb.from("spots").select("id").eq("name", DEFAULT_SPOT_NAME).maybeSingle();
        spotId = data?.id ?? null;
      }
      if (!spotId || cancelled) return;

      const dayStart = lagosDayStart(new Date()).toISOString();
      const [spotRes, statusRes, sessRes, profRes] = await Promise.all([
        sb.from("spots").select("id,name,band,discos(code),areas(city)").eq("id", spotId).single(),
        sb.from("spot_status").select("status,since,last_report_at").eq("spot_id", spotId).maybeSingle(),
        sb.from("supply_sessions").select("status,started_at,ended_at,last_confirmed_at").eq("spot_id", spotId).or(`ended_at.is.null,ended_at.gte.${dayStart}`),
        token && u.user ? sb.from("profiles").select("points,streak_current").eq("id", u.user.id).maybeSingle() : Promise.resolve({ data: null }),
      ]);
      if (cancelled) return;

      if (spotRes.data) {
        const s = spotRes.data as unknown as { id: string; name: string; band: string | null; discos: { code: string } | null; areas: { city: string | null } | null };
        setSpot({ id: s.id, name: s.name, band: s.band, disco: s.discos?.code ?? null, city: s.areas?.city ?? null });
      }
      if (statusRes.data) {
        setRow({
          status: statusRes.data.status as SpotState,
          since: statusRes.data.since ? new Date(statusRes.data.since) : null,
          lastReportAt: statusRes.data.last_report_at ? new Date(statusRes.data.last_report_at) : null,
        });
      }
      setSessions((sessRes.data ?? []).map((s) => ({
        status: s.status as ReportStatus, startedAt: new Date(s.started_at),
        endedAt: s.ended_at ? new Date(s.ended_at) : null, lastConfirmedAt: new Date(s.last_confirmed_at),
      })));
      if (profRes.data) { setPoints(profRes.data.points); setStreak(profRes.data.streak_current); }
      setLoaded(true);

      // Live updates: when anyone's report changes this spot, it changes here too.
      channel = sb.channel(`spot-${spotId}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "spot_status", filter: `spot_id=eq.${spotId}` }, (p) => {
          const n = p.new as { status: SpotState; since: string | null; last_report_at: string | null };
          setRow({ status: n.status, since: n.since ? new Date(n.since) : null, lastReportAt: n.last_report_at ? new Date(n.last_report_at) : null });
        })
        .subscribe();
    })();

    return () => { cancelled = true; if (channel) sb.removeChannel(channel); };
  }, []);

  // What to show: the stored status, aged by the clock (stale / unknown after long silence)
  const shown = useMemo(() => {
    const at = new Date(now || 0);
    return computeStatus([], row, at);
  }, [row, now]);

  const bulb: Status = shown.status === "mixed" ? "unknown" : shown.status;
  useEffect(() => { document.body.dataset.status = bulb; }, [bulb]);

  const lightToday = useMemo(() => {
    if (!now) return null;
    const d = dailyTotals(sessions, new Date(now), new Date(now));
    return d.on + d.weak + d.off === 0 ? null : (d.on + d.weak) / 60;
  }, [sessions, now]);

  const report = useCallback(async (s: ReportStatus) => {
    if (busy || !spot) return;
    setBusy(true);
    setMessage(null);
    navigator.vibrate?.(30);
    const before = row;
    // Instant feedback: show the new status straight away, then settle on what the server decides.
    setRow({ status: s, since: before.status === s ? before.since : new Date(), lastReportAt: new Date() });
    try {
      const [access, captcha] = await Promise.all([ensureSession(), getToken()]);
      const res = await fetch("/api/report", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${access ?? ""}`, "x-device-id": deviceId() },
        body: JSON.stringify({ spotId: spot.id, status: s, turnstileToken: captcha ?? undefined }),
      });
      const json = await res.json();
      if (res.ok && json.ok) {
        setRow({ status: json.status, since: new Date(json.since), lastReportAt: new Date() });
        setPoints(json.points);
        setStreak(json.streak);
        setMessage(json.isConfirmation ? t.thanks.confirm : t.thanks[s]);
      } else {
        setRow(before);
        if (json.error === "cooldown") setMessage(fmt(t.errors.cooldown, { mins: String(Math.max(1, Math.ceil((json.retryAfterSeconds ?? 60) / 60))) }));
        else if (json.error === "bot_check_failed") setMessage(t.errors.bot);
        else if (["user", "device", "ip"].includes(json.error)) setMessage(t.errors.limit);
        else setMessage(t.errors.generic);
      }
    } catch {
      setRow(before);
      setMessage(t.errors.offline);
    } finally {
      setBusy(false);
      setTimeout(() => setMessage(null), 5000);
    }
  }, [busy, spot, row, t, getToken]);

  // ---- Words on screen ----
  const duration = row.since && now ? formatDuration(now - row.since.getTime()) : "";
  const time = row.since ? formatLagosTime(row.since) : "";
  let sinceText = fmt(t.since[shown.status], { duration, time });
  if (!loaded) sinceText = t.since.loading;
  if (loaded && shown.stale && shown.status !== "unknown" && shown.status !== "mixed" && row.lastReportAt && now) {
    sinceText = fmt(t.since.stale, { ago: formatAgo(now - row.lastReportAt.getTime()) });
  }
  const word = t.status[shown.status];
  const dot = shown.status === "on" ? "var(--ok)" : shown.status === "weak" ? "var(--weak)" : "var(--off)";
  const title = spot ? spot.name.replace(/ \(whole area\)$/, "") : "…";
  const subline = spot ? [spot.city, spot.disco, spot.band ? `Band ${spot.band}` : null].filter(Boolean).join(" · ") : "";

  const stats: [React.ReactNode, string, string][] = [
    [<Ico key="c" d={Icon.clock} />, lightToday === null ? "–" : `${lightToday.toFixed(1)}h`, t.stats.today],
    [<Ico key="f" d={Icon.flame} />, String(streak), t.stats.streak],
    [<Ico key="s" d={Icon.star} />, String(points), t.stats.points],
  ];
  const nav: [React.ReactNode, string][] = [
    [Icon.home, t.nav.home], [Icon.search, t.nav.explore], [Icon.board, t.nav.board], [Icon.user, t.nav.profile],
  ];

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col px-5 pb-40 pt-4">
      <header className="flex items-center justify-between">
        <button className="press panel flex min-h-12 items-center gap-2 rounded-full pl-3.5 pr-3 text-[15px] font-medium">
          <Ico d={Icon.home} size={20} />
          {title}
          <Ico d={Icon.chevron} size={16} />
        </button>
        <div className="flex gap-2">
          <button onClick={() => setLang(lang === "en" ? "pcm" : "en")} aria-label={t.lang} className="press panel grid h-12 min-w-12 place-items-center rounded-full px-3 text-[13px] font-semibold">
            {lang === "en" ? "EN" : "PGN"}
          </button>
          <button aria-label="Toggle theme" onClick={() => setTheme(theme === "dark" ? "light" : "dark")} className="press panel grid h-12 w-12 place-items-center rounded-full">
            <Ico d={theme === "dark" ? Icon.sun : Icon.moon} />
          </button>
        </div>
      </header>

      <section className="mt-3 text-center">
        <Bulb status={bulb} />
        <p className="mt-5 min-h-[22px] text-[15px] text-muted">{subline}</p>
        <h2 className={`mt-1 font-light leading-[1.05] tracking-tight ${word.length > 12 ? "text-[38px]" : "text-[56px]"}`}>{word}</h2>
        <p className="mt-3 flex items-center justify-center gap-2 text-[15px] text-muted" aria-live="polite">
          <span className="h-2 w-2 rounded-full" style={{ background: dot, boxShadow: `0 0 8px ${dot}` }} />
          {sinceText}
        </p>
      </section>

      <section className="panel mt-6 rounded-[28px] p-3">
        <div className="grid grid-cols-2 gap-3">
          <button disabled={busy || !spot} onClick={() => report("on")} className="press flex min-h-[92px] flex-col items-center justify-center gap-2 rounded-[22px] text-[17px] font-semibold disabled:opacity-60" style={{ background: "linear-gradient(180deg,#ffd75e,#ffbf24)", color: "var(--on-text)", boxShadow: "0 8px 24px -8px rgba(255,190,40,.55), inset 0 1px 0 rgba(255,255,255,.5)" }}>
            <Ico d={Icon.bulbOn} size={26} />
            {t.buttons.on}
          </button>
          <button disabled={busy || !spot} onClick={() => report("off")} className="press panel flex min-h-[92px] flex-col items-center justify-center gap-2 rounded-[22px] text-[17px] font-semibold disabled:opacity-60" style={{ background: "var(--panel-strong)" }}>
            <Ico d={Icon.bulbOff} size={26} />
            {t.buttons.off}
          </button>
        </div>
        <button disabled={busy || !spot} onClick={() => report("weak")} className="press mt-3 flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl text-[15px] font-semibold text-weak disabled:opacity-60" style={{ border: "1px solid color-mix(in srgb, var(--weak) 45%, transparent)", background: "color-mix(in srgb, var(--weak) 8%, transparent)" }}>
          <Ico d={Icon.bolt} size={18} />
          {t.buttons.weak}
        </button>
      </section>
      <p className="mt-3 min-h-10 text-center text-sm text-muted" role="status">{message}</p>

      <section className="mt-1 grid grid-cols-3 text-center">
        {stats.map(([icon, v, l]) => (
          <div key={l} className="flex flex-col items-center gap-2">
            <div className="panel flex h-[68px] w-[68px] flex-col items-center justify-center rounded-full">
              <span className="text-muted">{icon}</span>
              <span className="text-[15px] font-semibold leading-tight">{v}</span>
            </div>
            <span className="text-xs text-muted">{l}</span>
          </div>
        ))}
      </section>

      {/* Invisible bot check (Cloudflare Turnstile). Takes no space unless Cloudflare needs to ask something. */}
      <div ref={turnstileBox} className="mt-4 flex justify-center" />

      <nav className="panel fixed inset-x-4 bottom-4 mx-auto max-w-md rounded-[28px]" style={{ background: "color-mix(in srgb, var(--bg) 70%, var(--panel-strong))" }}>
        <ul className="flex justify-around px-2 py-1.5">
          {nav.map(([d, l], idx) => (
            <li key={l}>
              <button className="flex min-h-14 min-w-16 flex-col items-center justify-center gap-0.5 text-[11px] font-medium" style={{ color: idx === 0 ? "var(--text)" : "var(--muted)" }}>
                <Ico d={d} size={23} />
                {l}
              </button>
            </li>
          ))}
        </ul>
      </nav>
    </main>
  );
}
