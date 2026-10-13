import { appConfig } from "../../../config/app.config";

export type ReportTime =
  | { ok: true; at: Date; delayed: boolean }
  | { ok: false; reason: "bad_time" | "too_old" };

/**
 * When a report actually happened. Phones send the moment of the tap along with reports that waited for the
 * network. We accept that time within limits so a saved report counts as of when it was made, but a phone cannot
 * invent a time far in the past, or one in the future.
 */
export function resolveReportTime(reportedAtMs: unknown, now: Date, cfg = appConfig.offline): ReportTime {
  if (reportedAtMs === undefined || reportedAtMs === null) return { ok: true, at: now, delayed: false };
  if (typeof reportedAtMs !== "number" || !Number.isFinite(reportedAtMs)) return { ok: false, reason: "bad_time" };

  const ageMs = now.getTime() - reportedAtMs;
  if (ageMs > cfg.maxAgeHours * 3_600_000) return { ok: false, reason: "too_old" };
  // A little ahead of the server clock is normal phone drift: treat it as now.
  if (ageMs < -cfg.futureToleranceMinutes * 60_000) return { ok: false, reason: "bad_time" };
  if (ageMs <= 0) return { ok: true, at: now, delayed: false };
  return { ok: true, at: new Date(reportedAtMs), delayed: ageMs > 60_000 };
}
