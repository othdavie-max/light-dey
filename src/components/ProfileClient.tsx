"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import en from "@/i18n/en/tabs.json";
import pcm from "@/i18n/pcm/tabs.json";
import BottomNav from "./BottomNav";
import AccountCard from "./AccountCard";
import AlertsCard from "./AlertsCard";
import DisplayModeCard from "./DisplayModeCard";
import { useTurnstile } from "@/lib/useTurnstile";
import { shareWithCard } from "@/lib/share";
import { appConfig } from "../../config/app.config";
import { supabase } from "@/lib/supabase/browser";
import { useMyStats } from "@/lib/useMyStats";
import { useLang, useTheme } from "@/lib/prefs";

const dict = { en, pcm } as const;
interface Badge { badge_code: string; badges: { name_en: string; name_pcm: string; description_en: string; description_pcm: string } | null }
const row = "press panel flex min-h-14 items-center justify-between rounded-2xl px-4 text-[16px]";

export default function ProfileClient() {
  const [lang, setLang] = useLang();
  const [theme, setTheme] = useTheme();
  const t = dict[lang].profile;
  const acct = dict[lang].account;
  const inv = dict[lang].invite;
  const copiedWord = lang === "en" ? "Link copied" : "Link don copy";
  async function invite() {
    const out = await shareWithCard({ path: "/", text: lang === "en" ? "Join me on Light Dey?: tell your neighbours if there is light." : "Join me for Light Dey?: tell your neighbours if light dey." });
    if (out === "copied") { setCopied(true); setTimeout(() => setCopied(false), 2500); }
  }
  const { points, streak, nickname } = useMyStats();
  const { box: captchaBox, getToken } = useTurnstile(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || appConfig.turnstileSiteKey);
  const [badges, setBadges] = useState<Badge[] | null>(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => { document.documentElement.dataset.theme = theme; }, [theme]);
  useEffect(() => {
    (async () => {
      const sb = supabase();
      const { data: s } = await sb.auth.getSession();
      const uid = s.session?.user.id;
      if (!uid) { setBadges([]); return; }
      const { data } = await sb.from("user_badges").select("badge_code,badges(name_en,name_pcm,description_en,description_pcm)").eq("user_id", uid).order("earned_at");
      setBadges((data as unknown as Badge[] | null) ?? []);
    })();
  }, []);

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

      <section className="mt-5">
        <h2 className="text-[17px] font-medium">{t.badges}</h2>
        {badges !== null && badges.length === 0 && <p className="mt-2 text-sm text-muted">{t.noBadges}</p>}
        <ul className="mt-2 space-y-2">
          {(badges ?? []).map((b) => (
            <li key={b.badge_code} className="panel rounded-2xl px-4 py-3">
              <p className="text-[16px] font-medium">{lang === "en" ? b.badges?.name_en : b.badges?.name_pcm}</p>
              <p className="text-sm text-muted">{lang === "en" ? b.badges?.description_en : b.badges?.description_pcm}</p>
            </li>
          ))}
        </ul>
      </section>

      <AlertsCard t={dict[lang].alerts} />
      <AccountCard t={acct} getToken={getToken} />

      <section className="panel mt-5 rounded-[24px] p-4">
        <h2 className="text-[16px] font-medium">{inv.title}</h2>
        <p className="mt-1 text-sm text-muted">{inv.body.replace("{n}", String(appConfig.points.referralBonus))}</p>
        <button onClick={invite} className="press mt-3 min-h-12 w-full rounded-2xl text-[15px] font-semibold" style={{ background: "var(--panel-strong)", border: "1px solid var(--panel-border)" }}>{copied ? copiedWord : inv.button}</button>
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
        <DisplayModeCard t={dict[lang].display} seg={seg} />
      </section>

      <div className="mt-5 space-y-2">
        <Link href="/onboarding?add=1" className={row}>{t.spots}{arrow}</Link>
        <Link href="/my-data" className={row}>{t.myData}{arrow}</Link>
        <Link href="/about" className={row}>{t.about}{arrow}</Link>
        <Link href="/privacy" className={row}>{t.privacy}{arrow}</Link>
        <Link href="/terms" className={row}>{t.terms}{arrow}</Link>
      </div>
      <div ref={captchaBox} className="mt-4 flex justify-center" />
      <BottomNav />
    </main>
  );
}
