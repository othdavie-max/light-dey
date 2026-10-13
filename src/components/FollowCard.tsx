"use client";
import { useEffect, useState } from "react";
import { getFollow, pushSupported, setAlertOnGo, startFollowing, stopFollowing, type FollowState } from "@/lib/pushClient";

interface Words { title: string; body: string; enable: string; on: string; goToo: string; off: string; denied: string; unsupported: string; full: string; error: string }

/** "Alert me when light comes" for one spot. */
export default function FollowCard({ spotId, t }: { spotId: string; t: Words }) {
  const [state, setState] = useState<FollowState | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");

  useEffect(() => {
    let off = false;
    getFollow(spotId).then((s) => { if (!off) setState(s); }).catch(() => { if (!off) setState({ following: false, alertOnGo: false }); });
    return () => { off = true; };
  }, [spotId]);

  async function turnOn() {
    setBusy(true); setNote("");
    const r = await startFollowing(spotId, false);
    if (r === "ok") setState({ following: true, alertOnGo: false });
    else setNote(r === "denied" ? t.denied : r === "unsupported" ? t.unsupported : r === "full" ? t.full : t.error);
    setBusy(false);
  }
  async function turnOff() { setBusy(true); if (await stopFollowing(spotId)) setState({ following: false, alertOnGo: false }); setBusy(false); }
  async function toggleGo() {
    if (!state) return;
    const next = !state.alertOnGo;
    setState({ ...state, alertOnGo: next });
    if (!(await setAlertOnGo(spotId, next))) setState({ ...state, alertOnGo: !next });
  }

  if (state === null) return null;
  return (
    <section className="panel mt-4 rounded-[24px] p-4">
      <h2 className="text-[16px] font-medium">{t.title}</h2>
      {!state.following ? (
        <>
          <p className="mt-1 text-sm text-muted">{t.body}</p>
          <button disabled={busy} onClick={turnOn} className="press mt-3 min-h-12 w-full rounded-2xl text-[15px] font-semibold disabled:opacity-60" style={{ background: "var(--panel-strong)", border: "1px solid var(--panel-border)" }}>
            {t.enable}
          </button>
          {!pushSupported() && <p className="mt-2 text-xs text-muted">{t.unsupported}</p>}
        </>
      ) : (
        <>
          <p className="mt-1 text-sm" style={{ color: "var(--ok)" }}>✓ {t.on}</p>
          <label className="mt-3 flex min-h-12 items-center gap-3 text-[15px]">
            <input type="checkbox" checked={state.alertOnGo} onChange={toggleGo} className="h-5 w-5" />
            {t.goToo}
          </label>
          <button disabled={busy} onClick={turnOff} className="press mt-1 min-h-12 px-1 text-[15px] text-muted">{t.off}</button>
        </>
      )}
      {note && <p className="mt-2 text-sm text-weak" role="status">{note}</p>}
    </section>
  );
}
