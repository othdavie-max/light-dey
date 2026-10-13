import { describe, expect, it } from "vitest";
import { badgesQualified, lagosHour, type BadgeFacts } from "./badges";

const base: BadgeFacts = { streakCurrent: 1, onReports: 1, changeReports: 0, lastReport: { status: "off", at: new Date("2026-10-13T12:00:00Z") }, joinRank: 5000 };

describe("badges", () => {
  it("awards nothing for a brand-new ordinary reporter", () => expect(badgesQualified(base)).toEqual([]));
  it("7-day streak earns NEPA Watchman, 6 does not", () => {
    expect(badgesQualified({ ...base, streakCurrent: 7 })).toContain("nepa_watchman");
    expect(badgesQualified({ ...base, streakCurrent: 6 })).not.toContain("nepa_watchman");
  });
  it("10 'light is on' reports earn Generator Free Spirit", () => {
    expect(badgesQualified({ ...base, onReports: 10 })).toContain("generator_free_spirit");
    expect(badgesQualified({ ...base, onReports: 9 })).not.toContain("generator_free_spirit");
  });
  it("10 status changes earn Area Correspondent", () => {
    expect(badgesQualified({ ...base, changeReports: 10 })).toContain("area_correspondent");
    expect(badgesQualified({ ...base, changeReports: 9 })).not.toContain("area_correspondent");
  });
  it("night shift: light reported on between 10pm and 5am Lagos time only", () => {
    const at = (iso: string) => new Date(iso);
    expect(badgesQualified({ ...base, lastReport: { status: "on", at: at("2026-10-13T21:30:00Z") } })).toContain("night_shift_reporter"); // 22:30 Lagos
    expect(badgesQualified({ ...base, lastReport: { status: "on", at: at("2026-10-13T03:59:00Z") } })).toContain("night_shift_reporter"); // 04:59 Lagos
    expect(badgesQualified({ ...base, lastReport: { status: "on", at: at("2026-10-13T04:00:00Z") } })).not.toContain("night_shift_reporter"); // 05:00
    expect(badgesQualified({ ...base, lastReport: { status: "on", at: at("2026-10-13T20:59:00Z") } })).not.toContain("night_shift_reporter"); // 21:59
    expect(badgesQualified({ ...base, lastReport: { status: "off", at: at("2026-10-13T23:00:00Z") } })).not.toContain("night_shift_reporter");
  });
  it("first 1000 profiles are founding reporters", () => {
    expect(badgesQualified({ ...base, joinRank: 1000 })).toContain("founding_reporter");
    expect(badgesQualified({ ...base, joinRank: 1001 })).not.toContain("founding_reporter");
    expect(badgesQualified({ ...base, joinRank: 0 })).not.toContain("founding_reporter");
  });
  it("Lagos hour is UTC+1", () => { expect(lagosHour(new Date("2026-10-13T23:30:00Z"))).toBe(0); });
});
