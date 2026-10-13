"use client";
import { useCallback, useState } from "react";
import { ensureSession, deviceId } from "./supabase/browser";
import { useTurnstile } from "./useTurnstile";
import { appConfig } from "../../config/app.config";
import type { ReportStatus } from "./status/types";
import type { SpotInfo, StatusRow } from "./useSpotLive";

interface Texts {
  thanks: { on: string; off: string; weak: string; confirm: string };
  errors: { cooldown: string; limit: string; offline: string; bot: string; generic: string };
}

const fmt = (s: string, v: Record<string, string>) => s.replace(/\{(\w+)\}/g, (_, k) => v[k] ?? "");

/**
 * The reporting flow shared by the home screen and the spot page: instant feedback, then settle on what
 * the server decides. Includes the invisible bot check. Render `turnstileBox` somewhere on the page.
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
  const { box: turnstileBox, getToken } = useTurnstile(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || appConfig.turnstileSiteKey);

  const report = useCallback(async (s: ReportStatus) => {
    if (busy || !spot) return;
    setBusy(true);
    setMessage(null);
    navigator.vibrate?.(30);
    const before = row;
    setRow({ status: s, since: before.status === s ? before.since : new Date(), lastReportAt: new Date() });
    try {
      const [access, captcha] = await Promise.all([ensureSession(), getToken()]);
      const res = await fetch("/api/report", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${access ?? ""}`, "x-device-id": deviceId() },
        body: JSON.stringify({ spotId: spot.id, status: s, turnstileToken: captcha ?? undefined }),
      });
      const json = await res.json();
      if (res.ok && json.ok) {
        setRow({ status: json.status, since: new Date(json.since), lastReportAt: new Date() });
        onAwarded?.({ points: json.points, streak: json.streak });
        setMessage(json.isConfirmation ? t.thanks.confirm : t.thanks[s]);
      } else {
        setRow(before);
        if (json.error === "cooldown") setMessage(fmt(t.errors.cooldown, { mins: String(Math.max(1, Math.ceil((json.retryAfterSeconds ?? 60) / 60))) }));
        else if (json.error === "bot_check_failed") setMessage(t.errors.bot);
        else if (["user", "device", "ip"].includes(json.error)) setMessage(t.errors.limit);
        else setMessage(t.errors.generic);
      }
    } catch {
      setRow(before);
      setMessage(t.errors.offline);
    } finally {
      setBusy(false);
      setTimeout(() => setMessage(null), 5000);
    }
  }, [busy, spot, row, setRow, t, getToken, onAwarded]);

  return { report, busy, message, turnstileBox };
}
