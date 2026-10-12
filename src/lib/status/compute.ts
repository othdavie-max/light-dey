import { appConfig, type StatusConfig } from "../../../config/app.config";
import type { ComputedStatus, CurrentStatus, ReportInput, ReportStatus } from "./types";

const MIN = 60_000;
const HOUR = 3_600_000;

/** Weight of one report: reporter trust, halving every `recencyHalfLifeMinutes`. */
export function reportWeight(trust: number, createdAt: Date, now: Date, cfg: StatusConfig = appConfig.status): number {
  const ageMin = Math.max(0, (now.getTime() - createdAt.getTime()) / MIN);
  return trust * Math.pow(0.5, ageMin / cfg.recencyHalfLifeMinutes);
}

/** A report that repeats the status already showing is a "confirmation" (smaller points, raises confidence). */
export function isConfirmation(current: CurrentStatus["status"], reported: ReportStatus): boolean {
  return current === reported;
}

function isConcrete(s: CurrentStatus["status"]): s is ReportStatus {
  return s === "on" || s === "off" || s === "weak";
}

/**
 * Work out a spot's status from recent reports.
 *
 * `reports` should be the spot's recent reports (at least the last `windowHours`; older ones are ignored).
 * `current` is what the spot_status row says right now.
 */
export function computeStatus(
  reports: ReportInput[],
  current: CurrentStatus,
  now: Date,
  cfg: StatusConfig = appConfig.status,
): ComputedStatus {
  const windowMs = cfg.windowHours * HOUR;

  // One vote per reporter: their latest report inside the window (ignoring clock-skewed future reports).
  const latestByReporter = new Map<string, ReportInput>();
  for (const r of reports) {
    const age = now.getTime() - r.createdAt.getTime();
    if (age > windowMs || age < -MIN) continue;
    const prev = latestByReporter.get(r.reporterId);
    if (!prev || r.createdAt > prev.createdAt) latestByReporter.set(r.reporterId, r);
  }
  const votes = [...latestByReporter.values()];

  const newestVote = votes.reduce<Date | null>((m, r) => (!m || r.createdAt > m ? r.createdAt : m), null);
  const lastReportAt = newestVote && (!current.lastReportAt || newestVote > current.lastReportAt) ? newestVote : current.lastReportAt;
  const lastKnown: ReportStatus | null = isConcrete(current.status) ? current.status : null;

  const ageHours = lastReportAt ? (now.getTime() - lastReportAt.getTime()) / HOUR : Infinity;
  const stale = ageHours > cfg.staleAfterHours;
  const freshness = ageHours <= cfg.staleAfterHours
    ? 1
    : Math.max(0, 1 - (ageHours - cfg.staleAfterHours) / (cfg.unknownAfterHours - cfg.staleAfterHours));

  // ---- Nobody has voted recently: keep what we knew, fading, until it becomes "unknown" ----
  if (votes.length === 0) {
    if (ageHours > cfg.unknownAfterHours || !isConcrete(current.status)) {
      return { status: "unknown", confidence: 0, stale: true, lastKnown, lastReportAt, weights: { on: 0, weak: 0, off: 0 }, reporters: 0 };
    }
    return { status: current.status, confidence: round(0.3 * freshness), stale, lastKnown, lastReportAt, weights: { on: 0, weak: 0, off: 0 }, reporters: 0 };
  }

  // ---- Weigh the votes ----
  const weights = { on: 0, weak: 0, off: 0 };
  for (const v of votes) weights[v.status] += reportWeight(v.trust, v.createdAt, now, cfg);
  const power = weights.on + weights.weak;           // light of some kind
  const total = power + weights.off;
  const reporters = votes.length;

  const finish = (status: ComputedStatus["status"], leadWeight: number, agreementCap = 1): ComputedStatus => {
    const agreement = Math.min(agreementCap, total > 0 ? leadWeight / total : 0);
    const volume = 1 - Math.exp(-total / cfg.confidenceSaturation);
    return {
      status,
      confidence: round(agreement * volume * freshness),
      stale,
      lastKnown: isConcrete(status) ? status : lastKnown,
      lastReportAt,
      weights,
      reporters,
    };
  };

  // ---- Strong disagreement => "Mixed reports" (both sides must have real support) ----
  const minority = Math.min(power, weights.off);
  if (minority >= cfg.mixedMinSupport && minority / total >= cfg.mixedMinShare) {
    return finish("mixed", Math.max(power, weights.off), 0.5);
  }

  // ---- Pick the leading side ----
  let sideIsPower: boolean;
  if (power === weights.off) {
    const newest = votes.reduce((a, b) => (b.createdAt > a.createdAt ? b : a));
    sideIsPower = newest.status !== "off";
  } else {
    sideIsPower = power > weights.off;
  }
  const candidate: ReportStatus = sideIsPower ? (weights.weak > weights.on ? "weak" : "on") : "off";
  // The whole "light" side (on + weak) backs "there is light"; only the chosen flavour becomes the status.
  const supportForCandidate = sideIsPower ? power : weights.off;

  // ---- Should the visible status change? ----
  if (isConcrete(current.status)) {
    if (candidate === current.status) return finish(candidate, supportForCandidate);

    // on <-> weak is a change within the light side: compare those two directly.
    // on/weak <-> off is a change of side: compare whole sides.
    const sameSide = (candidate === "off") === (current.status === "off");
    const challenger = sameSide ? weights[candidate] : supportForCandidate;
    const incumbent = sameSide ? weights[current.status] : current.status === "off" ? weights.off : power;

    const quiet = reporters <= cfg.quietMaxReporters;
    const needed = quiet ? cfg.flipSupportQuiet : cfg.flipSupportBusy;
    if (challenger >= needed && challenger >= cfg.flipMargin * incumbent) {
      return finish(candidate, supportForCandidate);
    }
    // Not enough to flip: stay put
    return finish(current.status, incumbent);
  }

  // Current is unknown or mixed: accept the leader if it has a little weight behind it
  if (supportForCandidate >= cfg.acceptSupportFromUnknown) return finish(candidate, supportForCandidate);
  return { status: "unknown", confidence: 0, stale, lastKnown, lastReportAt, weights, reporters };
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
