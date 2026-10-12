import { appConfig } from "../../../config/app.config";
import type { SupplySession } from "./types";

const MIN = 60_000;
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

export type TimelineState = "on" | "weak" | "off" | "unknown";
export interface Segment { state: TimelineState; start: Date; end: Date }
export interface DayTotals { on: number; weak: number; off: number; unknown: number }   // minutes

const offsetMs = () => appConfig.displayUtcOffsetMinutes * MIN;

/** Midnight (Africa/Lagos) at the start of the calendar day containing `date`, as a UTC instant. */
export function lagosDayStart(date: Date): Date {
  const shifted = date.getTime() + offsetMs();
  return new Date(Math.floor(shifted / DAY) * DAY - offsetMs());
}

/** Calendar day key like "2026-10-12" in Lagos time. */
export function lagosDayKey(date: Date): string {
  return new Date(date.getTime() + offsetMs()).toISOString().slice(0, 10);
}

/**
 * How long a session counts. It never counts past the last time anyone confirmed it plus
 * `unknownAfterHours`; after that the time is "unknown" (grey), not guessed.
 */
export function effectiveEnd(s: SupplySession, now: Date, unknownAfterHours = appConfig.status.unknownAfterHours): Date {
  const cap = s.lastConfirmedAt.getTime() + unknownAfterHours * HOUR;
  const natural = (s.endedAt ?? now).getTime();
  return new Date(Math.min(natural, cap));
}

/**
 * The 24-hour bar for one Lagos day: light (on/weak), off, and unknown gaps.
 * Sessions that started before midnight or end after it are clipped to this day.
 * Nothing is drawn for the future.
 */
export function buildTimeline(sessions: SupplySession[], dayStart: Date, now: Date): Segment[] {
  const dayEnd = dayStart.getTime() + DAY;
  const limit = Math.min(dayEnd, now.getTime());
  if (limit <= dayStart.getTime()) return [];

  const clipped = sessions
    .map((s) => ({ state: s.status as TimelineState, start: s.startedAt.getTime(), end: effectiveEnd(s, now).getTime() }))
    .filter((s) => s.end > dayStart.getTime() && s.start < limit)
    .sort((a, b) => a.start - b.start);

  const out: Segment[] = [];
  let cursor = dayStart.getTime();
  const push = (state: TimelineState, from: number, to: number) => {
    if (to > from) out.push({ state, start: new Date(from), end: new Date(to) });
  };

  for (const s of clipped) {
    const start = Math.max(s.start, cursor, dayStart.getTime());
    const end = Math.min(s.end, limit);
    if (end <= start) continue;
    push("unknown", cursor, start);          // gap before this session
    push(s.state, start, end);
    cursor = end;
  }
  push("unknown", cursor, limit);            // trailing gap up to "now" (or the end of a past day)
  return out;
}

export function totalsOf(segments: Segment[]): DayTotals {
  const t: DayTotals = { on: 0, weak: 0, off: 0, unknown: 0 };
  for (const s of segments) t[s.state] += Math.round((s.end.getTime() - s.start.getTime()) / MIN);
  return t;
}

/** Minutes per state for the Lagos day containing `day`. */
export function dailyTotals(sessions: SupplySession[], day: Date, now: Date): DayTotals {
  return totalsOf(buildTimeline(sessions, lagosDayStart(day), now));
}

export interface PeriodSummary {
  perDay: { day: string; totals: DayTotals; lightHours: number }[];
  /** Hours of light (on + weak) over the whole period. */
  totalLightHours: number;
  /**
   * Average light hours per 24h, based on KNOWN time only, so quiet spots are not punished for
   * nobody reporting. Null when there is no known time at all.
   */
  avgLightHoursPerDay: number | null;
  /** Share of the period we actually know about (0 to 1). Show this as data quality. */
  coverage: number;
}

/** The last `days` Lagos calendar days up to and including today (today is partial). */
export function summarisePeriod(sessions: SupplySession[], now: Date, days = 7): PeriodSummary {
  const todayStart = lagosDayStart(now).getTime();
  const perDay: PeriodSummary["perDay"] = [];
  let light = 0, known = 0, elapsed = 0;

  for (let i = days - 1; i >= 0; i--) {
    const dayStart = new Date(todayStart - i * DAY);
    const totals = totalsOf(buildTimeline(sessions, dayStart, now));
    const lightMin = totals.on + totals.weak;
    perDay.push({ day: lagosDayKey(dayStart), totals, lightHours: round1(lightMin / 60) });
    light += lightMin;
    known += lightMin + totals.off;
    elapsed += lightMin + totals.off + totals.unknown;
  }

  return {
    perDay,
    totalLightHours: round1(light / 60),
    avgLightHoursPerDay: known > 0 ? round1((light / known) * 24) : null,
    coverage: elapsed > 0 ? Math.round((known / elapsed) * 100) / 100 : 0,
  };
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
