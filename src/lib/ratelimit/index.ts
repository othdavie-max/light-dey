import { appConfig } from "../../../config/app.config";

export interface RateRule { windowSeconds: number; max: number }
export interface RateResult { allowed: boolean; remaining: number; retryAfterSeconds: number }

/**
 * Sliding window: allow if fewer than `max` hits happened in the last `windowSeconds`.
 * `hits` are the timestamps the server previously recorded for one key (a user, device or IP).
 */
export function slidingWindow(hits: Date[], now: Date, rule: RateRule): RateResult {
  const since = now.getTime() - rule.windowSeconds * 1000;
  const recent = hits.map((h) => h.getTime()).filter((t) => t > since && t <= now.getTime()).sort((a, b) => a - b);

  if (recent.length < rule.max) {
    return { allowed: true, remaining: rule.max - recent.length - 1, retryAfterSeconds: 0 };
  }
  // The oldest hit that still counts has to fall out of the window before another is allowed.
  const blocking = recent[recent.length - rule.max];
  return { allowed: false, remaining: 0, retryAfterSeconds: Math.max(1, Math.ceil((blocking + rule.windowSeconds * 1000 - now.getTime()) / 1000)) };
}

/** Same person, same spot: at most one report per cooldown (default 10 minutes). */
export function checkReportCooldown(
  lastReportAt: Date | null,
  now: Date,
  cooldownMinutes = appConfig.reportCooldownMinutes,
): RateResult {
  if (!lastReportAt) return { allowed: true, remaining: 0, retryAfterSeconds: 0 };
  const waitMs = lastReportAt.getTime() + cooldownMinutes * 60_000 - now.getTime();
  return waitMs <= 0
    ? { allowed: true, remaining: 0, retryAfterSeconds: 0 }
    : { allowed: false, remaining: 0, retryAfterSeconds: Math.ceil(waitMs / 1000) };
}

export interface ReportAttempt {
  now: Date;
  /** When the report was actually made (earlier than `now` for reports saved while offline). Used for the cooldown. */
  eventAt?: Date;
  lastReportAtForSpot: Date | null;       // this user/device, this spot
  userHits: Date[];
  deviceHits: Date[];
  ipHits: Date[];
}

/** Applies the cooldown and the per-user, per-device and per-IP rules; the strictest answer wins. */
export function evaluateReportAttempt(a: ReportAttempt): RateResult & { reason?: "cooldown" | "user" | "device" | "ip" } {
  const checks: [("cooldown" | "user" | "device" | "ip"), RateResult][] = [
    ["cooldown", checkReportCooldown(a.lastReportAtForSpot, a.eventAt ?? a.now)],
    ["user", slidingWindow(a.userHits, a.now, appConfig.rateLimits.perUser)],
    ["device", slidingWindow(a.deviceHits, a.now, appConfig.rateLimits.perDevice)],
    ["ip", slidingWindow(a.ipHits, a.now, appConfig.rateLimits.perIp)],
  ];
  const blocked = checks.filter(([, r]) => !r.allowed).sort((x, y) => y[1].retryAfterSeconds - x[1].retryAfterSeconds)[0];
  if (blocked) return { ...blocked[1], reason: blocked[0] };
  return { allowed: true, remaining: Math.min(...checks.map(([, r]) => r.remaining).filter((n) => n > 0), 999), retryAfterSeconds: 0 };
}
