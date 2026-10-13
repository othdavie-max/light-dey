"use client";
import { useEffect } from "react";
import Link from "next/link";
import en from "@/i18n/en/tabs.json";
import pcm from "@/i18n/pcm/tabs.json";
import BottomNav from "./BottomNav";
import { useMyStats } from "@/lib/useMyStats";
import { useLang, useTheme } from "@/lib/prefs";

const dict = { en, pcm } as const;
const row = "press panel flex min-h-14 items-center justify-between rounded-2xl px-4 text-[16px]";

export default function ProfileClient() {
  const [lang, setLang] = useLang();
  const [theme, setTheme] = useTheme();
  const t = dict[lang].profile;
  const { points, streak, nickname } = useMyStats();
  useEffect(() => { document.documentElement.dataset.theme = theme; }, [theme]);

  const seg = (on: boolean) => ({ background: on ? "var(--panel-strong)" : "transparent", color: on ? "var(--text)" : "var(--muted)", border: on ? "1px solid var(--panel-border)" : "1px solid transparent" });
  const arrow = <span aria-hidden="true" className="text-muted">→</span>;

  return (
    <main className="mx-auto min-h-dvh max-w-md px-5 pb-32 pt-6">
      <h1 className="text-[28px] font-light tracking-tight">{t.title}</h1>
      {nickname && <p className="mt-1 text-[17px] text-muted">{nickname}</p>}

      <section className="mt-5 grid grid-cols-2 gap-3 text-center">
        <div className="panel rounded-2xl p-4"><p className="text-[28px] font-light">{points}</p><p className="text-sm text-muted">{t.points}</p></div>
        <div className="panel rounded-2xl p-4"><p className="text-[28px] font-light">{streak}</p><p className="text-sm text-muted">{t.streak}</p></div>
      </section>

      <section className="mt-5 space-y-3">
        <div className="panel rounded-2xl p-3">
          <p className="px-1 pb-2 text-sm text-muted">{t.language}</p>
          <div className="grid grid-cols-2 gap-2">
            <button className="press min-h-12 rounded-xl text-[15px] font-medium" style={seg(lang === "en")} onClick={() => setLang("en")}>English</button>
            <button className="press min-h-12 rounded-xl text-[15px] font-medium" style={seg(lang === "pcm")} onClick={() => setLang("pcm")}>Pidgin</button>
          </div>
        </div>
        <div className="panel rounded-2xl p-3">
          <p className="px-1 pb-2 text-sm text-muted">{t.theme}</p>
          <div className="grid grid-cols-2 gap-2">
            <button className="press min-h-12 rounded-xl text-[15px] font-medium" style={seg(theme === "dark")} onClick={() => setTheme("dark")}>{t.dark}</button>
            <button className="press min-h-12 rounded-xl text-[15px] font-medium" style={seg(theme === "light")} onClick={() => setTheme("light")}>{t.light}</button>
          </div>
        </div>
      </section>

      <div className="mt-5 space-y-2">
        <Link href="/onboarding?add=1" className={row}>{t.spots}{arrow}</Link>
        <Link href="/my-data" className={row}>{t.myData}{arrow}</Link>
        <Link href="/about" className={row}>{t.about}{arrow}</Link>
        <Link href="/privacy" className={row}>{t.privacy}{arrow}</Link>
        <Link href="/terms" className={row}>{t.terms}{arrow}</Link>
      </div>
      <BottomNav />
    </main>
  );
}
