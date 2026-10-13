"use client";
import { useEffect } from "react";
import en from "@/i18n/en/tabs.json";
import pcm from "@/i18n/pcm/tabs.json";
import BottomNav from "./BottomNav";
import { useMyStats } from "@/lib/useMyStats";
import { useLang, useTheme } from "@/lib/prefs";

const dict = { en, pcm } as const;

export default function BoardClient() {
  const [lang] = useLang();
  const [theme] = useTheme();
  const t = dict[lang].board;
  const { points, streak } = useMyStats();
  useEffect(() => { document.documentElement.dataset.theme = theme; }, [theme]);
  return (
    <main className="mx-auto min-h-dvh max-w-md px-5 pb-32 pt-6">
      <h1 className="text-[28px] font-light tracking-tight">{t.title}</h1>
      <section className="panel mt-5 rounded-[28px] p-6 text-center">
        <p className="text-[20px] font-medium">{t.soon}</p>
        <p className="mt-2 text-[15px] text-muted">{t.body}</p>
      </section>
      <section className="mt-4 grid grid-cols-2 gap-3 text-center">
        <div className="panel rounded-2xl p-4"><p className="text-[28px] font-light">{points}</p><p className="text-sm text-muted">{t.yourPoints}</p></div>
        <div className="panel rounded-2xl p-4"><p className="text-[28px] font-light">{streak}</p><p className="text-sm text-muted">{t.yourStreak}</p></div>
      </section>
      <BottomNav />
    </main>
  );
}
