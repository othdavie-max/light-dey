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

function Ico({ d, size = 22, fill }: { d: React.ReactNode; size?: number; fill?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={fill ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {d}
    </svg>
  );
}

export default function HomeClient() {
  const [lang, setLang] = useState<Lang>("pcm");
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [status, setStatus] = useState<Status>("on");
  const [since, setSince] = useState(0);
  const [now, setNow] = useState(0);
  const [thanks, setThanks] = useState<string | null>(null);
  const [streak, setStreak] = useState(4);
  const [points, setPoints] = useState(120);
  const t = dict[lang];

  // Clock reads happen after mount so the server render stays stable.
  useEffect(() => {
    const t0 = Date.now();
    setNow(t0);
    setSince(t0 - (3 * 60 + 12) * 60000);
    const id = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(id);
  }, []);
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
  const word = t.status[status];
  const dot = status === "on" ? "var(--ok)" : status === "weak" ? "var(--weak)" : "var(--off)";

  const stats: [React.ReactNode, string, string][] = [
    [<Ico key="c" d={Icon.clock} />, "17h", t.stats.today],
    [<Ico key="f" d={Icon.flame} />, String(streak), t.stats.streak],
    [<Ico key="s" d={Icon.star} />, String(points), t.stats.points],
  ];
  const nav: [React.ReactNode, string][] = [
    [Icon.home, t.nav.home], [Icon.search, t.nav.explore], [Icon.board, t.nav.board], [Icon.user, t.nav.profile],
  ];

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col px-5 pb-32 pt-4">
      <header className="flex items-center justify-between">
        <button className="press panel flex min-h-12 items-center gap-2 rounded-full pl-3.5 pr-3 text-[15px] font-medium">
          <Ico d={Icon.home} size={20} />
          {demoSpot.name}
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
        <Bulb status={status} />
        <p className="mt-5 text-[15px] text-muted">{demoSpot.area} · {demoSpot.disco} · Band {demoSpot.band}</p>
        <h2 className={`mt-1 font-light leading-[1.05] tracking-tight ${word.length > 12 ? "text-[38px]" : "text-[56px]"}`}>{word}</h2>
        <p className="mt-3 flex items-center justify-center gap-2 text-[15px] text-muted" aria-live="polite">
          <span className="h-2 w-2 rounded-full" style={{ background: dot, boxShadow: `0 0 8px ${dot}` }} />
          {sinceText}
        </p>
      </section>

      <section className="panel mt-6 rounded-[28px] p-3">
        <div className="grid grid-cols-2 gap-3">
          <button onClick={() => report("on")} className="press flex min-h-[92px] flex-col items-center justify-center gap-2 rounded-[22px] text-[17px] font-semibold" style={{ background: "linear-gradient(180deg,#ffd75e,#ffbf24)", color: "var(--on-text)", boxShadow: "0 8px 24px -8px rgba(255,190,40,.55), inset 0 1px 0 rgba(255,255,255,.5)" }}>
            <Ico d={Icon.bulbOn} size={26} />
            {t.buttons.on}
          </button>
          <button onClick={() => report("off")} className="press panel flex min-h-[92px] flex-col items-center justify-center gap-2 rounded-[22px] text-[17px] font-semibold" style={{ background: "var(--panel-strong)" }}>
            <Ico d={Icon.bulbOff} size={26} />
            {t.buttons.off}
          </button>
        </div>
        <button onClick={() => report("weak")} className="press mt-3 flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl text-[15px] font-semibold text-weak" style={{ border: "1px solid color-mix(in srgb, var(--weak) 45%, transparent)", background: "color-mix(in srgb, var(--weak) 8%, transparent)" }}>
          <Ico d={Icon.bolt} size={18} />
          {t.buttons.weak}
        </button>
      </section>
      <p className="mt-3 min-h-5 text-center text-sm text-muted" role="status">{thanks}</p>

      <section className="mt-3 grid grid-cols-3 text-center">
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
