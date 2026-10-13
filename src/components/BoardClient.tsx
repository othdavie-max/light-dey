"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import en from "@/i18n/en/tabs.json";
import pcm from "@/i18n/pcm/tabs.json";
import BottomNav from "./BottomNav";
import { supabase } from "@/lib/supabase/browser";
import { useMyStats } from "@/lib/useMyStats";
import { useLang, useTheme } from "@/lib/prefs";

const dict = { en, pcm } as const;

interface Reporter { nickname: string; week_reports: number; streak: number; points: number }
interface AreaRow { area_id: number; area_name: string; city: string | null; light_hours_per_day: number; reporters: number }

export default function BoardClient() {
  const [lang] = useLang();
  const [theme] = useTheme();
  const t = dict[lang].board;
  const { points, streak, nickname } = useMyStats();
  const [tab, setTab] = useState<"reporters" | "areas">("reporters");
  const [reporters, setReporters] = useState<Reporter[] | null>(null);
  const [areas, setAreas] = useState<AreaRow[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => { document.documentElement.dataset.theme = theme; }, [theme]);
  useEffect(() => {
    (async () => {
      const sb = supabase();
      const [r, a] = await Promise.all([sb.rpc("leaderboard_reporters", { p_limit: 20 }), sb.rpc("leaderboard_areas", { p_limit: 20 })]);
      if (r.error && a.error) setFailed(true);
      setReporters((r.data as Reporter[] | null) ?? []);
      setAreas((a.data as AreaRow[] | null) ?? []);
    })();
  }, []);

  const seg = (on: boolean) => ({ background: on ? "var(--panel-strong)" : "transparent", color: on ? "var(--text)" : "var(--muted)", border: on ? "1px solid var(--panel-border)" : "1px solid transparent" });
  const list = tab === "reporters" ? reporters : areas;

  return (
    <main className="mx-auto min-h-dvh max-w-md px-5 pb-32 pt-6">
      <h1 className="text-[28px] font-light tracking-tight">{t.title}</h1>

      <section className="mt-4 grid grid-cols-2 gap-3 text-center">
        <div className="panel rounded-2xl p-3"><p className="text-[24px] font-light">{points}</p><p className="text-sm text-muted">{t.yourPoints}</p></div>
        <div className="panel rounded-2xl p-3"><p className="text-[24px] font-light">{streak}</p><p className="text-sm text-muted">{t.yourStreak}</p></div>
      </section>

      <div role="tablist" className="panel mt-4 grid grid-cols-2 gap-1 rounded-2xl p-1">
        <button role="tab" aria-selected={tab === "reporters"} className="press min-h-11 rounded-xl text-[15px] font-medium" style={seg(tab === "reporters")} onClick={() => setTab("reporters")}>{t.tabReporters}</button>
        <button role="tab" aria-selected={tab === "areas"} className="press min-h-11 rounded-xl text-[15px] font-medium" style={seg(tab === "areas")} onClick={() => setTab("areas")}>{t.tabAreas}</button>
      </div>
      <p className="mt-3 text-sm text-muted">{tab === "reporters" ? t.weekNote : t.areasNote}</p>

      <p className="mt-2 text-sm text-muted" role="status">{failed ? t.error : list === null ? t.loading : ""}</p>

      {list !== null && list.length === 0 && !failed && (
        <p className="panel mt-2 rounded-2xl p-5 text-center text-[15px] text-muted">{tab === "reporters" ? t.empty : t.emptyAreas}</p>
      )}

      {tab === "reporters" && (
        <ol className="mt-2 space-y-2">
          {(reporters ?? []).map((r, i) => {
            const me = r.nickname === nickname;
            return (
              <li key={r.nickname} className="panel flex min-h-14 items-center gap-3 rounded-2xl px-4" style={me ? { borderColor: "var(--on)", boxShadow: "0 0 0 1px var(--on)" } : undefined}>
                <span className="w-6 text-center text-[17px] font-semibold text-muted">{i + 1}</span>
                <span className="min-w-0 flex-1 truncate text-[16px] font-medium">{r.nickname}{me ? ` · ${t.you}` : ""}</span>
                <span className="text-sm text-muted">{r.week_reports} {t.reports}</span>
              </li>
            );
          })}
        </ol>
      )}

      {tab === "areas" && (
        <ol className="mt-2 space-y-2">
          {(areas ?? []).map((a, i) => (
            <li key={a.area_id}>
              <Link href={`/area/${a.area_id}`} className="press panel flex min-h-14 items-center gap-3 rounded-2xl px-4">
                <span className="w-6 text-center text-[17px] font-semibold text-muted">{i + 1}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[16px] font-medium">{a.area_name}</span>
                  <span className="block text-sm text-muted">{[a.city, `${a.reporters} ${t.people}`].filter(Boolean).join(" · ")}</span>
                </span>
                <span className="text-[17px] font-semibold">{Number(a.light_hours_per_day).toFixed(1)}<span className="ml-1 text-xs font-normal text-muted">{t.hoursDay}</span></span>
              </Link>
            </li>
          ))}
        </ol>
      )}
      <BottomNav />
    </main>
  );
}
