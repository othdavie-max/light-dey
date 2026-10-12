import { describe, expect, it } from "vitest";
import { checkReportCooldown, evaluateReportAttempt, slidingWindow } from "./index";

const NOW = new Date("2026-10-12T12:00:00Z");
const secsAgo = (s: number) => new Date(NOW.getTime() - s * 1000);

describe("slidingWindow", () => {
  const rule = { windowSeconds: 3600, max: 3 };
  it("allows when under the limit", () => {
    const r = slidingWindow([secsAgo(100), secsAgo(200)], NOW, rule);
    expect(r.allowed).toBe(true);
    expect(r.remaining).toBe(0);
  });
  it("blocks at the limit and says when to retry", () => {
    const r = slidingWindow([secsAgo(100), secsAgo(200), secsAgo(300)], NOW, rule);
    expect(r.allowed).toBe(false);
    expect(r.retryAfterSeconds).toBe(3300);   // oldest hit (300s ago) leaves the window in 3300s
  });
  it("ignores hits outside the window", () => {
    expect(slidingWindow([secsAgo(4000), secsAgo(5000), secsAgo(6000)], NOW, rule).allowed).toBe(true);
  });
  it("allows again once old hits expire", () => {
    const hits = [secsAgo(3601), secsAgo(200), secsAgo(100)];
    expect(slidingWindow(hits, NOW, rule).allowed).toBe(true);
  });
});

describe("checkReportCooldown (once per 10 minutes per spot)", () => {
  it("allows the first report", () => {
    expect(checkReportCooldown(null, NOW).allowed).toBe(true);
  });
  it("blocks a second report 3 minutes later", () => {
    const r = checkReportCooldown(secsAgo(180), NOW);
    expect(r.allowed).toBe(false);
    expect(r.retryAfterSeconds).toBe(420);
  });
  it("allows a report after 10 minutes", () => {
    expect(checkReportCooldown(secsAgo(601), NOW).allowed).toBe(true);
  });
  it("respects a changed cooldown from config", () => {
    expect(checkReportCooldown(secsAgo(180), NOW, 2).allowed).toBe(true);
  });
});

describe("evaluateReportAttempt", () => {
  const base = { now: NOW, lastReportAtForSpot: null, userHits: [], deviceHits: [], ipHits: [] };
  it("allows a normal report", () => {
    expect(evaluateReportAttempt(base).allowed).toBe(true);
  });
  it("blocks for the cooldown", () => {
    const r = evaluateReportAttempt({ ...base, lastReportAtForSpot: secsAgo(60) });
    expect(r).toMatchObject({ allowed: false, reason: "cooldown" });
  });
  it("blocks a user who reports too often", () => {
    const hits = Array.from({ length: 30 }, (_, i) => secsAgo(10 + i));
    expect(evaluateReportAttempt({ ...base, userHits: hits })).toMatchObject({ allowed: false, reason: "user" });
  });
  it("blocks an IP that sends too much, even across many users", () => {
    const hits = Array.from({ length: 60 }, (_, i) => secsAgo(10 + i));
    expect(evaluateReportAttempt({ ...base, ipHits: hits })).toMatchObject({ allowed: false, reason: "ip" });
  });
  it("reports the longest wait when several rules block", () => {
    const hits = Array.from({ length: 30 }, (_, i) => secsAgo(10 + i));
    const r = evaluateReportAttempt({ ...base, lastReportAtForSpot: secsAgo(60), userHits: hits });
    expect(r.reason).toBe("user");
  });
});
