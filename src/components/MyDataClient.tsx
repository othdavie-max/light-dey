"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import en from "@/i18n/en/mydata.json";
import pcm from "@/i18n/pcm/mydata.json";
import { supabase } from "@/lib/supabase/browser";
import { useLang } from "@/lib/prefs";

const dict = { en, pcm } as const;

async function call(method: "GET" | "DELETE") {
  const { data } = await supabase().auth.getSession();
  return fetch("/api/me", { method, cache: "no-store", headers: { authorization: `Bearer ${data.session?.access_token ?? ""}` } });
}

export default function MyDataClient() {
  const [lang] = useLang();
  const t = dict[lang].myData;
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [busy, setBusy] = useState<"download" | "delete" | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await supabase().auth.getSession();
      if (alive) setSignedIn(!!data.session);
    })();
    return () => { alive = false; };
  }, []);

  async function download() {
    setBusy("download");
    setMessage(null);
    try {
      const res = await call("GET");
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "light-dey-my-data.json";
      a.click();
      URL.revokeObjectURL(url);
    } catch { setMessage(t.error); }
    setBusy(null);
  }

  async function remove() {
    setBusy("delete");
    setMessage(null);
    try {
      const res = await call("DELETE");
      const json = await res.json().catch(() => ({}));
      if (res.status === 403) { setMessage(t.admin); setBusy(null); return; }
      if (!res.ok || !json.ok) throw new Error();
      try { localStorage.clear(); } catch { /* storage blocked */ }
      await supabase().auth.signOut();
      setDone(true);
    } catch { setMessage(t.error); }
    setBusy(null);
  }

  const btn = "press min-h-12 rounded-2xl px-6 text-[16px] font-semibold disabled:opacity-50";

  return (
    <main className="mx-auto max-w-xl px-5 pb-24 pt-5">
      <Link href="/" className="press panel inline-flex min-h-12 items-center gap-2 rounded-full px-4 text-[15px]">← Light Dey?</Link>
      <h1 className="mt-6 text-[34px] font-light tracking-tight">{t.title}</h1>
      <p className="mt-2 text-muted">{t.intro}</p>

      {done ? (
        <section className="panel mt-8 rounded-3xl p-6" role="status">
          <p className="text-[18px]">{t.deleted}</p>
          <Link href="/onboarding" className={`${btn} mt-5 inline-flex items-center`} style={{ background: "var(--panel-strong)", border: "1px solid var(--panel-border)" }}>{t.deletedHome}</Link>
        </section>
      ) : signedIn === false ? (
        <p className="mt-8 text-muted">{t.noAccount}</p>
      ) : (
        <>
          <section className="panel mt-8 rounded-3xl p-6">
            <h2 className="text-[19px] font-medium">{t.downloadTitle}</h2>
            <p className="mt-1 text-[15px] text-muted">{t.downloadBody}</p>
            <button onClick={download} disabled={busy !== null || signedIn === null} className={`${btn} mt-4`} style={{ background: "linear-gradient(180deg,#ffd75e,#ffbf24)", color: "var(--on-text)" }}>
              {busy === "download" ? t.downloading : t.downloadButton}
            </button>
          </section>

          <section className="panel mt-4 rounded-3xl p-6" style={{ borderColor: "color-mix(in srgb, #ef4444 40%, var(--panel-border))" }}>
            <h2 className="text-[19px] font-medium">{t.deleteTitle}</h2>
            <p className="mt-1 text-[15px] text-muted">{t.deleteBody}</p>
            {!confirming ? (
              <button onClick={() => setConfirming(true)} disabled={signedIn === null} className={`${btn} mt-4`} style={{ background: "color-mix(in srgb, #ef4444 20%, transparent)", border: "1px solid color-mix(in srgb, #ef4444 50%, transparent)" }}>{t.deleteStart}</button>
            ) : (
              <div className="mt-4">
                <label className="flex min-h-12 items-start gap-3 text-[15px]">
                  <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-1 h-5 w-5" />
                  <span>{t.deleteConfirm}</span>
                </label>
                <button onClick={remove} disabled={!agreed || busy !== null} className={`${btn} mt-3`} style={{ background: "#ef4444", color: "#fff" }}>
                  {busy === "delete" ? t.deleting : t.deleteButton}
                </button>
              </div>
            )}
          </section>
          {message && <p className="mt-4 text-[15px]" style={{ color: "var(--weak)" }} role="alert">{message}</p>}
        </>
      )}

      <p className="mt-8 text-[15px]"><Link href="/privacy" className="underline underline-offset-2">{t.privacy}</Link></p>
    </main>
  );
}
