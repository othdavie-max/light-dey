"use client";
import en from "@/i18n/en/common.json";
import pcm from "@/i18n/pcm/common.json";
import { useLang } from "@/lib/prefs";

const dict = { en, pcm } as const;

export default function OfflineNotice() {
  const [lang] = useLang();
  const t = dict[lang].offline.page;
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-6 text-center">
      <div className="mb-6 grid h-20 w-20 place-items-center rounded-full text-4xl" style={{ background: "var(--panel-strong)", border: "1px solid var(--panel-border)" }} aria-hidden="true">📡</div>
      <h1 className="text-[30px] font-light tracking-tight">{t.title}</h1>
      <p className="mt-3 text-[16px] leading-relaxed text-muted">{t.body}</p>
      {/* A full page load (not a soft navigation) so the browser really tries the network again */}
      {/* eslint-disable-next-line @next/next/no-location-assign-relative-destination */}
      <button onClick={() => window.location.assign("/")} className="press mt-8 inline-flex min-h-14 items-center rounded-2xl px-8 text-[17px] font-semibold" style={{ background: "linear-gradient(180deg,#ffd75e,#ffbf24)", color: "var(--on-text)" }}>
        {t.retry}
      </button>
    </main>
  );
}
