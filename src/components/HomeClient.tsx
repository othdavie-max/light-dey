"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import en from "@/i18n/en/common.json";
import pcm from "@/i18n/pcm/common.json";
import Bulb, { type Status } from "./Bulb";
import StatusSelector from "./StatusSelector";
import BottomNav from "./BottomNav";
import ConnectionStatus from "./ConnectionStatus";
import InstallPrompt from "./InstallPrompt";
import LegalLinks from "./LegalLinks";
import { hasConsent, recordConsent } from "@/lib/consent";
import { claimInvite } from "@/lib/invite";
import { shareWithCard } from "@/lib/share";
import { supabase, ensureSession } from "@/lib/supabase/browser";
import { useLang, useTheme, getActiveSpot, setActiveSpot } from "@/lib/prefs";
import { useSpotLive } from "@/lib/useSpotLive";
import { useReport } from "@/lib/useReport";
import { computeStatus } from "@/lib/status/compute";
import { dailyTotals } from "@/lib/status/hours";
import { formatAgo, formatDuration, formatLagosTime } from "@/lib/format";
import { appConfig } from "../../config/app.config";

const dict = { en, pcm } as const;

interface SavedSpot { id: string; label: string | null; name: string }

// Small copies kept on the phone so the home screen can open with no network
function readSaved(): SavedSpot[] {
  try { const v = JSON.parse(localStorage.getItem("ld_saved") ?? "[]"); return Array.isArray(v) ? v : []; } catch { return []; }
}
function writeSaved(list: SavedSpot[]) {
  try { localStorage.setItem("ld_saved", JSON.stringify(list)); } catch { /* storage blocked */ }
}
function readStats(): { points: number; streak: number } | null {
  try { const v = JSON.parse(localStorage.getItem("ld_stats") ?? "null"); return v && typeof v.points === "number" ? v : null; } catch { return null; }
}
function writeStats(points: number, streak: number) {
  try { localStorage.setItem("ld_stats", JSON.stringify({ points, streak })); } catch { /* storage blocked */ }
}

function fmt(s: string, vars: Record<string, string>) {
  return s.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? "");
}
const shortName = (n: string) => n.replace(/ \(whole area\)$/, "");

const Icon = {
  home: <path d="M4 11l8-7 8 7v8a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z" />,
  chevron: <path d="M6 9l6 6 6-6" />,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6L7 7M17 17l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4" /></>,
  moon: <path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z" />,
  clock: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>,
  flame: <path d="M12 3c1 3.5 5 5.5 5 10a5 5 0 0 1-10 0c0-2 1-3 2-4 .3 1.5 1 2 1.5 2C10.5 8.5 11 6 12 3z" />,
  star: <path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.8l-5.2 2.8 1-5.8L3.5 9.7l5.9-.8z" />,
  plus: <path d="M12 5v14M5 12h14" />,
  trash: <path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12" />,
};

function Ico({ d, size = 22 }: { d: React.ReactNode; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {d}
    </svg>
  );
}

export default function HomeClient() {
  const router = useRouter();
  const [lang, setLang] = useLang();
  const [theme, setTheme] = useTheme();
  const [saved, setSaved] = useState<SavedSpot[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [sheet, setSheet] = useState(false);
  const [now, setNow] = useState(0);
  const [streak, setStreak] = useState(0);
  const [points, setPoints] = useState(0);
  const [copied, setCopied] = useState(false);
  const t = dict[lang];

  const { loaded, spot, row, sessions, setRow } = useSpotLive(activeId);
  const { report, busy, message, turnstileBox, pending } = useReport({
    spot, row, setRow, t,
    onAwarded: (r) => { setPoints(r.points); setStreak(r.streak); writeStats(r.points, r.streak); },
  });

  // A ticking clock (updated from timers, never during render)
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, 30_000);
    return () => { clearTimeout(first); clearInterval(id); };
  }, []);

  useEffect(() => { document.documentElement.dataset.theme = theme; }, [theme]);

  // Who is this, which spots have they saved, and which one are we showing?
  // The answer is also kept on the phone, so the app opens straight to the right spot with no network.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Everyone agrees to the Terms and Privacy Policy first (people who joined before this existed see it once)
      if (!hasConsent()) { router.replace("/onboarding?consent=1"); return; }
      void recordConsent();                                      // keeps the account's record up to date; harmless to repeat
      const sb = supabase();
      const token = await ensureSession();
      void claimInvite(token);                                  // joined through a friend's link? tell the server once
      const { data: s } = await sb.auth.getSession();           // read from the phone, works offline
      const uid = s.session?.user.id;
      if (cancelled) return;
      let list: SavedSpot[] | null = null;                      // null = we could not find out (no network)
      if (token && uid) {
        const [rows, prof] = await Promise.all([
          sb.from("saved_spots").select("spot_id,label,position,spots(name)").eq("user_id", uid).order("position"),
          sb.from("profiles").select("points,streak_current").eq("id", uid).maybeSingle(),
        ]);
        if (!rows.error) {
          list = (rows.data ?? []).map((r) => ({ id: r.spot_id, label: r.label, name: (r.spots as unknown as { name: string } | null)?.name ?? "" }));
          writeSaved(list);
        }
        if (prof.data) {
          setPoints(prof.data.points); setStreak(prof.data.streak_current);
          writeStats(prof.data.points, prof.data.streak_current);
        }
      }
      if (cancelled) return;
      const unknown = list === null;
      if (unknown) {
        list = readSaved();
        const st = readStats();
        if (st) { setPoints(st.points); setStreak(st.streak); }
      }
      const known = list ?? [];
      setSaved(known);
      const remembered = getActiveSpot();
      // Only send someone to onboarding when we KNOW they have no spot, never just because the network is down
      const pick = known.find((x) => x.id === remembered)?.id ?? known[0]?.id ?? (unknown ? remembered : null);
      if (!pick) { router.replace("/onboarding"); return; }
      setActiveSpot(pick);
      setActiveId(pick);
    })();
    return () => { cancelled = true; };
  }, [router]);

  function switchTo(id: string) {
    setSheet(false);
    if (id === activeId) return;
    setActiveSpot(id);
    setActiveId(id);
  }

  async function removeSpot(id: string) {
    const sb = supabase();
    const { data: u } = await sb.auth.getUser();
    if (!u.user) return;
    await sb.from("saved_spots").delete().eq("user_id", u.user.id).eq("spot_id", id);
    const rest = saved.filter((s) => s.id !== id);
    setSaved(rest);
    if (id === activeId) {
      if (rest[0]) switchTo(rest[0].id);
      else router.replace("/onboarding");
    }
  }

  // What to show: the stored status, aged by the clock (stale / unknown after long silence)
  const shown = useMemo(() => computeStatus([], row, new Date(now || 0)), [row, now]);
  const bulb: Status = shown.status === "mixed" ? "unknown" : shown.status;
  useEffect(() => { document.body.dataset.status = bulb; }, [bulb]);

  async function share() {
    if (!spot) return;
    const text = fmt(t.share.text, { spot: shortName(spot.name), status: t.status[shown.status] });
    const out = await shareWithCard({ path: `/spot/${spot.id}`, text, cardQuery: `spot=${spot.id}&lang=${lang}` });
    if (out === "copied") { setCopied(true); setTimeout(() => setCopied(false), 2500); }
  }

  const lightToday = useMemo(() => {
    if (!now) return null;
    const d = dailyTotals(sessions, new Date(now), new Date(now));
    return d.on + d.weak + d.off === 0 ? null : (d.on + d.weak) / 60;
  }, [sessions, now]);

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
  const activeSaved = saved.find((s) => s.id === activeId);
  const title = spot ? shortName(spot.name) : "…";
  const subline = spot ? [spot.city, spot.disco, spot.band ? `Band ${spot.band}` : null].filter(Boolean).join(" · ") : "";

  const stats: [React.ReactNode, string, string][] = [
    [<Ico key="c" d={Icon.clock} />, lightToday === null ? "–" : `${lightToday.toFixed(1)}h`, t.stats.today],
    [<Ico key="f" d={Icon.flame} />, String(streak), t.stats.streak],
    [<Ico key="s" d={Icon.star} />, String(points), t.stats.points],
  ];

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col px-5 pb-40 pt-4">
      <header className="flex items-center justify-between gap-2">
        <button onClick={() => setSheet(true)} aria-haspopup="dialog" className="press panel flex min-h-12 min-w-0 items-center gap-2 rounded-full pl-3.5 pr-3 text-[15px] font-medium">
          <Ico d={Icon.home} size={20} />
          <span className="truncate">{activeSaved?.label ? `${activeSaved.label} · ${title}` : title}</span>
          <Ico d={Icon.chevron} size={16} />
        </button>
        <div className="flex shrink-0 gap-2">
          <button onClick={() => setLang(lang === "en" ? "pcm" : "en")} aria-label={t.lang} className="press panel grid h-12 min-w-12 place-items-center rounded-full px-3 text-[13px] font-semibold">
            {lang === "en" ? "EN" : "PGN"}
          </button>
          <button aria-label="Toggle theme" onClick={() => setTheme(theme === "dark" ? "light" : "dark")} className="press panel grid h-12 w-12 place-items-center rounded-full">
            <Ico d={theme === "dark" ? Icon.sun : Icon.moon} />
          </button>
        </div>
      </header>

      <ConnectionStatus
        offlineText={t.offline.banner}
        waitingText={pending > 0 ? fmt(pending === 1 ? t.offline.waiting : t.offline.waitingMany, { n: String(pending) }) : null}
      />

      <section className="mt-3 text-center">
        <div className="pt-6"><Bulb status={bulb} height={300} /></div>
        <p className="mt-9 min-h-[22px] text-[15px] tracking-wide text-muted">{subline}</p>
        <h2 className={`mt-2 font-light leading-[1.05] tracking-[-0.02em] ${word.length > 12 ? "text-[40px]" : "text-[58px]"}`}>{word}</h2>
        <p className="mt-3 flex items-center justify-center gap-2 text-[15px] text-muted" aria-live="polite">
          <span className="h-2 w-2 rounded-full" style={{ background: dot }} />
          {sinceText}
        </p>
      </section>

      <StatusSelector current={shown.status} disabled={busy || !spot} onReport={report} t={t.buttons} />
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

      {spot && (
        <div className="mt-6 grid grid-cols-[1fr_auto] gap-3">
          <Link href={`/spot/${spot.id}`} className="press panel flex min-h-14 items-center justify-between rounded-2xl px-5 text-[16px] font-medium">
            {t.moreDetails}
            <span aria-hidden="true" className="text-muted">→</span>
          </Link>
          <button onClick={share} className="press panel min-h-14 rounded-2xl px-5 text-[16px] font-medium">{copied ? t.share.copied : `↗ ${t.share.button}`}</button>
        </div>
      )}

      <InstallPrompt ready={points > 0} text={t.install} />
      <LegalLinks />

      {/* Invisible bot check (Cloudflare Turnstile). Takes no space unless Cloudflare needs to ask something. */}
      <div ref={turnstileBox} className="mt-4 flex justify-center" />

      <BottomNav />

      {sheet && (
        <div className="fixed inset-0 z-50 flex items-end bg-black/60" onClick={() => setSheet(false)} onKeyDown={(e) => e.key === "Escape" && setSheet(false)}>
          <div role="dialog" aria-modal="true" aria-label={t.spots.title} onClick={(e) => e.stopPropagation()}
            className="mx-auto w-full max-w-md rounded-t-[28px] p-5 pb-8" style={{ background: "var(--bg)", border: "1px solid var(--panel-border)" }}>
            <div className="flex items-center justify-between">
              <h3 className="text-[20px] font-medium">{t.spots.title}</h3>
              <button onClick={() => setSheet(false)} className="press min-h-12 px-3 text-[15px] text-muted">{t.spots.close}</button>
            </div>
            <ul className="mt-3 space-y-2">
              {saved.length === 0 && <li className="text-muted">{t.spots.empty}</li>}
              {saved.map((s) => (
                <li key={s.id} className="flex gap-2">
                  <button onClick={() => switchTo(s.id)} className="press panel min-h-14 flex-1 rounded-2xl px-4 text-left"
                    style={s.id === activeId ? { borderColor: "var(--on)", boxShadow: "0 0 0 1px var(--on)" } : undefined}>
                    <span className="block text-[16px] font-medium">{shortName(s.name)}</span>
                    {s.label && <span className="text-sm text-muted">{s.label}</span>}
                  </button>
                  <button onClick={() => removeSpot(s.id)} aria-label={`${t.spots.remove} ${shortName(s.name)}`} className="press panel grid h-14 w-14 place-items-center rounded-2xl text-muted">
                    <Ico d={Icon.trash} size={20} />
                  </button>
                </li>
              ))}
            </ul>
            {saved.length < appConfig.maxSavedSpots ? (
              <button onClick={() => router.push("/onboarding?add=1")} className="press mt-4 flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl text-[16px] font-medium" style={{ background: "var(--panel-strong)", border: "1px solid var(--panel-border)" }}>
                <Ico d={Icon.plus} size={20} /> {t.spots.add}
              </button>
            ) : (
              <p className="mt-4 text-sm text-muted">{t.spots.full}</p>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
