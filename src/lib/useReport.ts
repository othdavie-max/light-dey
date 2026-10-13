"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { ensureSession, deviceId } from "./supabase/browser";
import { useTurnstile } from "./useTurnstile";
import { enqueue, loadQueue, recordAttempt, remove } from "./offlineQueue";
import { appConfig } from "../../config/app.config";
import type { ReportStatus } from "./status/types";
import type { SpotInfo, StatusRow } from "./useSpotLive";

interface Texts {
  thanks: { on: string; off: string; weak: string; confirm: string };
  errors: { cooldown: string; limit: string; offline: string; bot: string; generic: string };
  offline: { queued: string; sent: string };
}

const fmt = (s: string, v: Record<string, string>) => s.replace(/\{(\w+)\}/g, (_, k) => v[k] ?? "");
const storage = () => { try { return window.localStorage; } catch { return null; } };

type Sent =
  | { kind: "done"; json: Record<string, unknown> }      // the server decided (accepted or refused for good)
  | { kind: "retry" };                                    // no network, or the server hiccuped: try again later

async function send(body: Record<string, unknown>, access: string | null): Promise<Sent & { status?: number }> {
  try {
    const res = await fetch("/api/report", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${access ?? ""}`, "x-device-id": deviceId() },
      body: JSON.stringify(body),
    });
    if (res.status >= 500) return { kind: "retry" };
    return { kind: "done", json: await res.json(), status: res.status };
  } catch {
    return { kind: "retry" };
  }
}

/**
 * The reporting flow shared by the home screen and the spot page: instant feedback, then settle on what the
 * server decides. If there is no network the report is saved on the phone and sent automatically later (with
 * the time it was made and a unique id, so it counts once and counts as of when it happened).
 * Render `turnstileBox` somewhere on the page.
 */
export function useReport(opts: {
  spot: SpotInfo | null;
  row: StatusRow;
  setRow: (r: StatusRow) => void;
  t: Texts;
  onAwarded?: (r: { points: number; streak: number }) => void;
}) {
  const { spot, row, setRow, t, onAwarded } = opts;
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(0);
  const { box: turnstileBox, getToken } = useTurnstile(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || appConfig.turnstileSiteKey);

  // Latest values for the background sender, so its timers never go stale
  const latest = useRef({ spot, setRow, onAwarded, t, getToken });
  useEffect(() => { latest.current = { spot, setRow, onAwarded, t, getToken }; });
  const flushing = useRef(false);

  const flush = useCallback(async () => {
    if (flushing.current || !navigator.onLine) return;
    const st = storage();
    if (loadQueue(st).length === 0) { setPending(0); return; }
    flushing.current = true;
    let sent = 0;
    try {
      for (const item of loadQueue(st)) {
        const captcha = await latest.current.getToken();
        if (!captcha) break;                                   // bot check not ready yet: try again shortly
        const access = await ensureSession();
        const r = await send({ spotId: item.spotId, status: item.status, clientId: item.clientId, reportedAt: item.at, turnstileToken: captcha }, access);
        if (r.kind === "retry") { recordAttempt(st, item.clientId); break; }
        const json = r.json as { ok?: boolean; error?: string; status?: never };
        if (json.ok) {
          remove(st, item.clientId);
          sent++;
          const j = r.json as { status: StatusRow["status"]; since: string; points: number; streak: number };
          if (latest.current.spot?.id === item.spotId) latest.current.setRow({ status: j.status, since: new Date(j.since), lastReportAt: new Date() });
          latest.current.onAwarded?.({ points: j.points, streak: j.streak });
        } else if (r.status === 401 || json.error === "bot_check_failed") {
          recordAttempt(st, item.clientId);                    // may work next time
          break;
        } else {
          remove(st, item.clientId);                           // refused for good (cooldown, too old, banned...): do not retry forever
        }
      }
    } finally {
      flushing.current = false;
      setPending(loadQueue(st).length);
    }
    if (sent > 0) setMessage(latest.current.t.offline.sent);
  }, []);

  // Send saved reports: shortly after opening, when the network returns, when the app comes back to the screen,
  // and every few seconds while any are waiting.
  useEffect(() => {
    const run = () => { void flush(); };
    const first = setTimeout(() => { setPending(loadQueue(storage()).length); run(); }, 2500);
    const vis = () => { if (document.visibilityState === "visible") run(); };
    const timer = setInterval(() => { if (loadQueue(storage()).length > 0) run(); }, appConfig.offline.retryEverySeconds * 1000);
    window.addEventListener("online", run);
    document.addEventListener("visibilitychange", vis);
    return () => { clearTimeout(first); clearInterval(timer); window.removeEventListener("online", run); document.removeEventListener("visibilitychange", vis); };
  }, [flush]);

  const report = useCallback(async (s: ReportStatus) => {
    if (busy || !spot) return;
    setBusy(true);
    setMessage(null);
    navigator.vibrate?.(30);
    const before = row;
    const clientId = crypto.randomUUID();
    const at = Date.now();
    setRow({ status: s, since: before.status === s ? before.since : new Date(), lastReportAt: new Date() });

    const save = () => {
      const q = enqueue(storage(), { clientId, spotId: spot.id, status: s, at });
      setPending(q.length);
      setMessage(t.offline.queued);                            // keep the optimistic status: it is saved, not lost
    };

    try {
      if (!navigator.onLine) { save(); return; }
      const [access, captcha] = await Promise.all([ensureSession(), getToken()]);
      const r = await send({ spotId: spot.id, status: s, clientId, reportedAt: at, turnstileToken: captcha ?? undefined }, access);
      if (r.kind === "retry") { save(); return; }

      const json = r.json as { ok?: boolean; error?: string; retryAfterSeconds?: number; isConfirmation?: boolean; status: StatusRow["status"]; since: string; points: number; streak: number };
      if (json.ok) {
        setRow({ status: json.status, since: new Date(json.since), lastReportAt: new Date() });
        onAwarded?.({ points: json.points, streak: json.streak });
        setMessage(json.isConfirmation ? t.thanks.confirm : t.thanks[s]);
      } else {
        setRow(before);
        if (json.error === "cooldown") setMessage(fmt(t.errors.cooldown, { mins: String(Math.max(1, Math.ceil((json.retryAfterSeconds ?? 60) / 60))) }));
        else if (json.error === "bot_check_failed") setMessage(t.errors.bot);
        else if (["user", "device", "ip"].includes(json.error ?? "")) setMessage(t.errors.limit);
        else setMessage(t.errors.generic);
      }
    } finally {
      setBusy(false);
      setTimeout(() => setMessage(null), 5000);
    }
  }, [busy, spot, row, setRow, t, getToken, onAwarded]);

  return { report, busy, message, turnstileBox, pending };
}
