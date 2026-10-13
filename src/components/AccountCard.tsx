"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/browser";
import { fullClient } from "@/lib/supabase/full";

interface Words {
  title: string; keepBody: string; email: string; saveEmail: string; google: string; checkEmail: string; signedInAs: string; signOut: string;
  signOutNote: string; haveAccount: string; signIn: string; signInGoogle: string; busy: string; error: string; exists: string; or: string;
}

const input = "panel mt-2 min-h-12 w-full rounded-2xl px-4 text-[16px] outline-none";
const btn = "press mt-2 min-h-12 w-full rounded-2xl text-[15px] font-semibold disabled:opacity-60";
const btnStyle = { background: "var(--panel-strong)", border: "1px solid var(--panel-border)" };

/** Keep points across phones: add an email or Google to the anonymous account, or sign in to an existing one. */
export default function AccountCard({ t, getToken }: { t: Words; getToken: () => Promise<string | null> }) {
  const [who, setWho] = useState<{ anonymous: boolean; email: string | null } | null>(null);
  const [email, setEmail] = useState("");
  const [mode, setMode] = useState<"keep" | "signin">("keep");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");

  useEffect(() => {
    (async () => {
      const { data } = await supabase().auth.getUser();
      const u = data.user;
      setWho(u ? { anonymous: !!(u as { is_anonymous?: boolean }).is_anonymous, email: u.email ?? null } : { anonymous: true, email: null });
    })();
  }, []);

  const back = () => `${window.location.origin}/profile`;
  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  async function run(job: () => Promise<{ error: { message: string } | null }>, okText: string) {
    setBusy(true); setNote("");
    try {
      const { error } = await job();
      setNote(error ? (/already|registered|exists|linked/i.test(error.message) ? t.exists : t.error) : okText);
    } catch { setNote(t.error); }
    setBusy(false);
  }

  const keepEmail = () => run(() => fullClient().auth.updateUser({ email: email.trim() }, { emailRedirectTo: back() }), t.checkEmail);
  const keepGoogle = () => run(async () => { const r = await fullClient().auth.linkIdentity({ provider: "google", options: { redirectTo: back() } }); return { error: r.error }; }, "");
  const signInEmail = () => run(async () => {
    const captchaToken = (await getToken()) ?? undefined;
    return fullClient().auth.signInWithOtp({ email: email.trim(), options: { emailRedirectTo: back(), captchaToken, shouldCreateUser: false } });
  }, t.checkEmail);
  const signInGoogle = () => run(async () => { const r = await fullClient().auth.signInWithOAuth({ provider: "google", options: { redirectTo: back() } }); return { error: r.error }; }, "");

  async function signOut() {
    setBusy(true);
    try { await supabase().auth.signOut(); } catch { /* signed out locally anyway */ }
    try { Object.keys(localStorage).filter((k) => k.startsWith("ld_") && !["ld_lang", "ld_theme", "ld_consent", "ld_consent_recorded", "ld_device"].includes(k)).forEach((k) => localStorage.removeItem(k)); } catch { /* storage blocked */ }
    window.location.assign("/");   // eslint-disable-line @next/next/no-location-assign-relative-destination -- a full reload clears every in-memory copy of the old account
  }

  if (who === null) return null;

  if (!who.anonymous && who.email) {
    return (
      <section className="panel mt-5 rounded-[24px] p-4">
        <h2 className="text-[16px] font-medium">{t.title}</h2>
        <p className="mt-1 text-sm" style={{ color: "var(--ok)" }}>✓ {t.signedInAs} {who.email}</p>
        <button disabled={busy} onClick={signOut} className={btn} style={btnStyle}>{t.signOut}</button>
        <p className="mt-2 text-xs text-muted">{t.signOutNote}</p>
      </section>
    );
  }

  return (
    <section className="panel mt-5 rounded-[24px] p-4">
      <h2 className="text-[16px] font-medium">{mode === "keep" ? t.title : t.haveAccount}</h2>
      {mode === "keep" && <p className="mt-1 text-sm text-muted">{t.keepBody}</p>}
      <input type="email" inputMode="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t.email} aria-label={t.email} className={input} />
      <button disabled={busy || !valid} onClick={mode === "keep" ? keepEmail : signInEmail} className={btn} style={btnStyle}>{busy ? t.busy : mode === "keep" ? t.saveEmail : t.signIn}</button>
      <p className="my-2 text-center text-xs text-muted">{t.or}</p>
      <button disabled={busy} onClick={mode === "keep" ? keepGoogle : signInGoogle} className={btn} style={btnStyle}>{mode === "keep" ? t.google : t.signInGoogle}</button>
      {note && <p className="mt-2 text-sm" role="status">{note}</p>}
      <button onClick={() => { setMode(mode === "keep" ? "signin" : "keep"); setNote(""); }} className="press mt-2 min-h-12 w-full text-[14px] text-muted underline">
        {mode === "keep" ? t.haveAccount : t.title}
      </button>
    </section>
  );
}
