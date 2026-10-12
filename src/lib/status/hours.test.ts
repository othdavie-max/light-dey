import { describe, expect, it } from "vitest";
import { buildTimeline, dailyTotals, effectiveEnd, lagosDayKey, lagosDayStart, summarisePeriod } from "./hours";
import type { SupplySession } from "./types";

const t = (s: string) => new Date(s);
const session = (status: SupplySession["status"], start: string, end: string | null, confirmed?: string): SupplySession => ({
  status, startedAt: t(start), endedAt: end ? t(end) : null, lastConfirmedAt: t(confirmed ?? end ?? start),
});

describe("Lagos days (UTC+1)", () => {
  it("finds the start of the Lagos day", () => {
    // 23:30 UTC on 12 Oct is 00:30 on 13 Oct in Lagos, so that Lagos day began at 23:00 UTC on the 12th
    expect(lagosDayStart(t("2026-10-12T23:30:00Z")).toISOString()).toBe("2026-10-12T23:00:00.000Z");
    expect(lagosDayStart(t("2026-10-12T12:00:00Z")).toISOString()).toBe("2026-10-11T23:00:00.000Z");
  });
  it("names the Lagos calendar day", () => {
    expect(lagosDayKey(t("2026-10-12T23:30:00Z"))).toBe("2026-10-13");
    expect(lagosDayKey(t("2026-10-12T22:59:00Z"))).toBe("2026-10-12");
  });
});

describe("sessions that cross midnight", () => {
  // On from 21:00 to 03:00 Lagos time (20:00Z to 02:00Z)
  const night = [session("on", "2026-10-12T20:00:00Z", "2026-10-13T02:00:00Z")];
  const now = t("2026-10-13T12:00:00Z");

  it("counts the part before midnight on the first day", () => {
    expect(dailyTotals(night, t("2026-10-12T12:00:00Z"), now).on).toBe(180);
  });
  it("counts the part after midnight on the next day", () => {
    expect(dailyTotals(night, t("2026-10-13T12:00:00Z"), now).on).toBe(180);
  });
  it("splits exactly (no minutes lost or doubled)", () => {
    const a = dailyTotals(night, t("2026-10-12T12:00:00Z"), now);
    const b = dailyTotals(night, t("2026-10-13T12:00:00Z"), now);
    expect(a.on + b.on).toBe(360);
  });
  it("fills the rest of a past day with unknown", () => {
    const d = dailyTotals(night, t("2026-10-12T12:00:00Z"), now);
    expect(d.on + d.weak + d.off + d.unknown).toBe(1440);
  });
  it("only counts today up to now (nothing for the future)", () => {
    const d = dailyTotals(night, t("2026-10-13T12:00:00Z"), now);
    expect(d.on + d.weak + d.off + d.unknown).toBe(13 * 60);
  });
});

describe("buildTimeline", () => {
  it("returns on, off and unknown segments in order", () => {
    const s = [session("on", "2026-10-12T00:00:00Z", "2026-10-12T04:00:00Z"), session("off", "2026-10-12T04:00:00Z", "2026-10-12T06:00:00Z")];
    const tl = buildTimeline(s, t("2026-10-11T23:00:00Z"), t("2026-10-12T08:00:00Z"));
    expect(tl.map((x) => x.state)).toEqual(["unknown", "on", "off", "unknown"]);
  });
  it("returns nothing for a day that has not started", () => {
    expect(buildTimeline([], t("2026-10-13T23:00:00Z"), t("2026-10-12T12:00:00Z"))).toEqual([]);
  });
  it("does not double count overlapping sessions", () => {
    const s = [session("on", "2026-10-12T00:00:00Z", "2026-10-12T05:00:00Z"), session("off", "2026-10-12T04:00:00Z", "2026-10-12T06:00:00Z")];
    const total = buildTimeline(s, t("2026-10-11T23:00:00Z"), t("2026-10-12T08:00:00Z")).reduce((n, x) => n + (x.end.getTime() - x.start.getTime()), 0);
    expect(total).toBe(9 * 3_600_000);
  });
});

describe("unknown time is never guessed", () => {
  it("stops counting an unconfirmed session 12 hours after its last confirmation", () => {
    const open = session("on", "2026-10-12T06:00:00Z", null, "2026-10-12T08:00:00Z");
    expect(effectiveEnd(open, t("2026-10-12T22:00:00Z")).toISOString()).toBe("2026-10-12T20:00:00.000Z");
    const d = dailyTotals([open], t("2026-10-12T12:00:00Z"), t("2026-10-12T22:00:00Z"));
    expect(d.on).toBe(14 * 60);       // 06:00Z to 20:00Z
    expect(d.unknown).toBe(9 * 60);   // 23:00Z to 06:00Z, then 20:00Z to 22:00Z
  });
  it("caps a closed session too, if nobody confirmed it before it was replaced", () => {
    const stale = session("on", "2026-10-12T00:00:00Z", "2026-10-12T20:00:00Z", "2026-10-12T01:00:00Z");
    expect(effectiveEnd(stale, t("2026-10-12T22:00:00Z")).toISOString()).toBe("2026-10-12T13:00:00.000Z");
  });
});

describe("summarisePeriod", () => {
  const now = t("2026-10-12T22:00:00Z");
  const sessions = [
    session("on", "2026-10-11T23:00:00Z", "2026-10-12T08:00:00Z"),      // 9h light
    session("off", "2026-10-12T08:00:00Z", "2026-10-12T20:00:00Z"),     // 12h dark
    session("on", "2026-10-12T20:00:00Z", null, "2026-10-12T21:00:00Z"),// 2h light, still open
  ];
  it("averages light hours over KNOWN time", () => {
    const s = summarisePeriod(sessions, now, 1);
    expect(s.totalLightHours).toBe(11);
    expect(s.avgLightHoursPerDay).toBe(11.5);   // 11 / 23 * 24
    expect(s.coverage).toBe(1);
  });
  it("reports coverage when much of the time is unknown", () => {
    const s = summarisePeriod([session("on", "2026-10-12T00:00:00Z", "2026-10-12T04:00:00Z")], now, 1);
    expect(s.coverage).toBeLessThan(0.25);
    expect(s.avgLightHoursPerDay).toBe(24);     // all known time was light
  });
  it("has no average when nothing is known", () => {
    expect(summarisePeriod([], now, 7).avgLightHoursPerDay).toBeNull();
  });
  it("returns one entry per day, oldest first", () => {
    const s = summarisePeriod(sessions, now, 7);
    expect(s.perDay).toHaveLength(7);
    expect(s.perDay[6].day).toBe("2026-10-12");
    expect(s.perDay[0].day).toBe("2026-10-06");
  });
  it("counts weak light as light", () => {
    const s = summarisePeriod([session("weak", "2026-10-11T23:00:00Z", "2026-10-12T05:00:00Z")], now, 1);
    expect(s.totalLightHours).toBe(6);
  });
});
