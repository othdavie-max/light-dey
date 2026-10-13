import { describe, expect, it } from "vitest";
import { applyReport } from "./rewards";

const fresh = { points: 0, streakCurrent: 0, streakBest: 0, lastReportDay: null };
const at = (s: string) => new Date(s);

describe("applyReport", () => {
  it("gives full points and starts a streak on a first report", () => {
    const r = applyReport(fresh, { isConfirmation: false, changedStatus: false, now: at("2026-10-12T12:00:00Z") });
    expect(r).toMatchObject({ pointsAwarded: 10, points: 10, streakCurrent: 1, streakBest: 1, lastReportDay: "2026-10-12" });
  });
  it("gives fewer points for a confirmation", () => {
    expect(applyReport(fresh, { isConfirmation: true, changedStatus: false, now: at("2026-10-12T12:00:00Z") }).pointsAwarded).toBe(2);
  });
  it("adds a bonus when the report changed the status", () => {
    expect(applyReport(fresh, { isConfirmation: false, changedStatus: true, now: at("2026-10-12T12:00:00Z") }).pointsAwarded).toBe(15);
  });
  it("does not grow the streak twice in one day", () => {
    const s = { points: 10, streakCurrent: 3, streakBest: 3, lastReportDay: "2026-10-12" };
    expect(applyReport(s, { isConfirmation: false, changedStatus: false, now: at("2026-10-12T15:00:00Z") }).streakCurrent).toBe(3);
  });
  it("grows the streak on the next day", () => {
    const s = { points: 10, streakCurrent: 3, streakBest: 3, lastReportDay: "2026-10-12" };
    const r = applyReport(s, { isConfirmation: false, changedStatus: false, now: at("2026-10-13T08:00:00Z") });
    expect(r).toMatchObject({ streakCurrent: 4, streakBest: 4 });
  });
  it("resets the streak after a missed day but keeps the best", () => {
    const s = { points: 10, streakCurrent: 5, streakBest: 5, lastReportDay: "2026-10-10" };
    const r = applyReport(s, { isConfirmation: false, changedStatus: false, now: at("2026-10-12T08:00:00Z") });
    expect(r).toMatchObject({ streakCurrent: 1, streakBest: 5 });
  });
  it("uses Lagos days: 23:30 UTC already counts as the next Lagos day", () => {
    const s = { points: 0, streakCurrent: 2, streakBest: 2, lastReportDay: "2026-10-12" };
    const r = applyReport(s, { isConfirmation: false, changedStatus: false, now: at("2026-10-12T23:30:00Z") });
    expect(r.lastReportDay).toBe("2026-10-13");
    expect(r.streakCurrent).toBe(3);
  });
});
