"use client";
import { useEffect, useState } from "react";
import en from "@/i18n/en.json";
import pcm from "@/i18n/pcm.json";
import Bulb, { type Status } from "./Bulb";

const dict = { en, pcm } as const;
type Lang = keyof typeof dict;

// DEMO ONLY: fake spot and numbers so you can judge the look. Real data comes in a later step.
const demoSpot = { name: "Wuye District", area: "Wuye, Abuja", disco: "AEDC", band: "A" };

function fmt(s: string, vars: Record<string, string>) {
  return s.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? "");
}

export default function HomeClient() {
  const [lang, setLang] = useState<Lang>("pcm");
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [status, setStatus] = useState<Status>("on");
  const [since, setSince] = useState(0);
  const [now, setNow] = useState(0);

  // Clock reads happen after mount so the server render stays stable.
  useEffect(() => {
    const t0 = Date.now();
    setNow(t0);
    setSince(t0 - (3 * 60 + 12) * 60000);
    const id = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(id);
  }, []);
  const [thanks, setThanks] = useState<string | null>(null);
  const [streak, setStreak] = useState(4);
  const [points, setPoints] = useState(120);
  const t = dict[lang];

  useEffect(() => { document.body.dataset.status = status; }, [status]);
  useEffect(() => { document.documentElement.dataset.theme = theme; }, [theme]);

  function report(s: "on" | "off" | "weak") {
    navigator.vibrate?.(30);
    if (s !== status) { setSince(Date.now()); setNow(Date.now()); }
    setStatus(s);
    setPoints((p) => p + (s === status ? 2 : 10));
    if (streak < 5) setStreak(5);
    setThanks(t.thanks[s]);
    setTimeout(() => setThanks(null), 3500);
  }

  const mins = since ? Math.max(0, Math.round((now - since) / 60000)) : 0;
  const duration = `${Math.floor(mins / 60)}hrs ${mins % 60}mins`;
  const time = new Date(since).toLocaleTimeString("en-NG", { hour: "numeric", minute: "2-digit", timeZone: "Africa/Lagos" });
  const sinceText = fmt(t.since[status], { duration, time });

  const btn = "press flex min-h-[72px] w-full items-center justify-center gap-3 rounded-2xl text-xl font-extrabold";
  const stats: [string, string, string][] = [
    ["🕒", "17h", t.stats.today],
    ["🔥", String(streak), t.stats.streak],
    ["⭐", String(points), t.stats.points],
  ];
  const nav: [string, string][] = [["🏠", t.nav.home], ["🔎", t.nav.explore], ["🏆", t.nav.board], ["👤", t.nav.profile]];

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col px-4 pb-24 pt-4">
      <header className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted">{t.demo}</p>
          <h1 className="text-lg font-extrabold">{demoSpot.name}</h1>
          <p className="text-sm text-muted">{demoSpot.area} · {demoSpot.disco} · Band {demoSpot.band}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setLang(lang === "en" ? "pcm" : "en")} className="press min-h-12 rounded-xl bg-surface px-3 text-sm font-bold">{t.lang}</button>
          <button aria-label="Toggle theme" onClick={() => setTheme(theme === "dark" ? "light" : "dark")} className="press min-h-12 min-w-12 rounded-xl bg-surface text-lg">{theme === "dark" ? "☀️" : "🌙"}</button>
        </div>
      </header>

      <section className="mt-4 text-center">
        <Bulb status={status} />
        <h2 className="mt-2 text-3xl font-extrabold" style={{ color: status === "on" ? "var(--on)" : status === "weak" ? "var(--weak)" : undefined }}>
          {t.status[status]}
        </h2>
        <p className="mt-1 text-base text-muted" aria-live="polite">{sinceText}</p>
      </section>

      <section className="mt-6 space-y-3">
        <button onClick={() => report("on")} className={btn} style={{ background: "var(--on)", color: "var(--on-text)" }}>✅ {t.buttons.on}</button>
        <button onClick={() => report("off")} className={btn} style={{ background: "var(--surface-2)", color: "var(--text)", border: "2px solid var(--off)" }}>❌ {t.buttons.off}</button>
        <button onClick={() => report("weak")} className="press min-h-12 w-full rounded-xl text-base font-bold" style={{ color: "var(--weak)", border: "1.5px solid var(--weak)" }}>⚡ {t.buttons.weak}</button>
        <p className="min-h-6 text-center text-sm font-semibold" role="status">{thanks}</p>
      </section>

      <section className="mt-3 grid grid-cols-3 gap-2 text-center">
        {stats.map(([i, v, l]) => (
          <div key={l} className="rounded-2xl bg-surface p-3">
            <div className="text-lg">{i}</div>
            <div className="text-xl font-extrabold">{v}</div>
            <div className="text-xs text-muted">{l}</div>
          </div>
        ))}
      </section>

      <nav className="fixed inset-x-0 bottom-0 border-t border-white/10 bg-surface/95 backdrop-blur">
        <ul className="mx-auto flex max-w-md justify-around">
          {nav.map(([i, l], idx) => (
            <li key={l}>
              <button className="flex min-h-14 min-w-16 flex-col items-center justify-center text-xs" style={{ color: idx === 0 ? "var(--on)" : "var(--muted)" }}>
                <span className="text-xl">{i}</span>{l}
              </button>
            </li>
          ))}
        </ul>
      </nav>
    </main>
  );
}
