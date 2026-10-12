import { describe, expect, it } from "vitest";
import { computeStatus, isConfirmation, reportWeight } from "./compute";
import type { CurrentStatus, ReportInput, ReportStatus } from "./types";

const NOW = new Date("2026-10-12T12:00:00Z");
const minsAgo = (m: number) => new Date(NOW.getTime() - m * 60_000);
const rep = (id: string, status: ReportStatus, ago = 1, trust = 1): ReportInput => ({ reporterId: id, status, createdAt: minsAgo(ago), trust });
const cur = (status: CurrentStatus["status"], lastAgo: number | null = 30): CurrentStatus => ({
  status, since: lastAgo === null ? null : minsAgo(lastAgo + 60), lastReportAt: lastAgo === null ? null : minsAgo(lastAgo),
});
const UNKNOWN = cur("unknown", null);

describe("reportWeight (recency decay)", () => {
  it("is the full trust for a brand-new report", () => {
    expect(reportWeight(1, NOW, NOW)).toBeCloseTo(1);
  });
  it("halves every hour", () => {
    expect(reportWeight(1, minsAgo(60), NOW)).toBeCloseTo(0.5);
    expect(reportWeight(1, minsAgo(120), NOW)).toBeCloseTo(0.25);
  });
  it("scales with trust", () => {
    expect(reportWeight(2, minsAgo(60), NOW)).toBeCloseTo(1);
  });
});

describe("computeStatus: first reports", () => {
  it("is unknown with no reports and no history", () => {
    const r = computeStatus([], UNKNOWN, NOW);
    expect(r.status).toBe("unknown");
    expect(r.confidence).toBe(0);
  });
  it("accepts a single trusted report on an unknown spot", () => {
    const r = computeStatus([rep("a", "on")], UNKNOWN, NOW);
    expect(r.status).toBe("on");
    expect(r.confidence).toBeGreaterThan(0);
    expect(r.reporters).toBe(1);
  });
  it("ignores a report from a very low-trust reporter on an unknown spot", () => {
    expect(computeStatus([rep("a", "on", 1, 0.2)], UNKNOWN, NOW).status).toBe("unknown");
  });
  it("only counts each reporter's latest report", () => {
    const r = computeStatus([rep("a", "on", 30), rep("a", "off", 2)], UNKNOWN, NOW);
    expect(r.status).toBe("off");
    expect(r.reporters).toBe(1);
  });
  it("ignores reports dated in the future (clock skew)", () => {
    const r = computeStatus([{ reporterId: "a", status: "on", trust: 1, createdAt: new Date(NOW.getTime() + 10 * 60_000) }], UNKNOWN, NOW);
    expect(r.status).toBe("unknown");
  });
  it("picks weak when most light reports are weak", () => {
    const r = computeStatus([rep("a", "weak"), rep("b", "weak"), rep("c", "weak"), rep("d", "on")], UNKNOWN, NOW);
    expect(r.status).toBe("weak");
  });
});

describe("computeStatus: one troll cannot flip a busy spot", () => {
  const crowd = [rep("a", "on", 5), rep("b", "on", 8), rep("c", "on", 3), rep("d", "on", 10)];
  it("stays on when 4 people say on and 1 says off", () => {
    const r = computeStatus([...crowd, rep("troll", "off", 1)], cur("on"), NOW);
    expect(r.status).toBe("on");
  });
  it("flips when a real majority says off", () => {
    const off = [rep("a", "off", 2), rep("b", "off", 3), rep("c", "off", 1), rep("d", "off", 4), rep("e", "on", 20)];
    expect(computeStatus(off, cur("on"), NOW).status).toBe("off");
  });
});

describe("computeStatus: thresholds are enforced on their own", () => {
  it("a busy spot needs real weight behind a change, even when the challenger leads", () => {
    // 3 reporters (busy). The old "on" vote is faint; two half-trust "off" votes lead but only add up to 1.0 (needs 2.5).
    const r = computeStatus([rep("a", "on", 180), rep("b", "off", 1, 0.5), rep("c", "off", 1, 0.5)], cur("on", 180), NOW);
    expect(r.status).toBe("on");
  });
  it("and flips once the weight is there", () => {
    const r = computeStatus([rep("a", "on", 180), rep("b", "off", 1, 1.5), rep("c", "off", 1, 1.5)], cur("on", 180), NOW);
    expect(r.status).toBe("off");
  });
  it("two evenly split but light-weight reports are not 'Mixed' (each side needs 1.5)", () => {
    const r = computeStatus([rep("a", "on", 1), rep("b", "off", 2)], UNKNOWN, NOW);
    expect(r.status).not.toBe("mixed");
  });
  it("a split is 'Mixed' once each side carries 1.5", () => {
    const r = computeStatus([rep("a", "on", 1, 1.6), rep("b", "off", 1, 1.6)], UNKNOWN, NOW);
    expect(r.status).toBe("mixed");
  });
});

describe("computeStatus: quiet spots", () => {
  it("lets one fresh trusted reporter change a quiet spot", () => {
    const r = computeStatus([rep("a", "on", 120), rep("b", "off", 1)], cur("on", 120), NOW);
    expect(r.status).toBe("off");
  });
  it("does not let a low-trust reporter change a quiet spot", () => {
    const r = computeStatus([rep("a", "on", 120), rep("b", "off", 1, 0.3)], cur("on", 120), NOW);
    expect(r.status).toBe("on");
  });
});

describe("computeStatus: conflicting reports", () => {
  it("shows Mixed when both sides have strong support", () => {
    const r = computeStatus([rep("a", "on"), rep("b", "on"), rep("c", "off"), rep("d", "off")], cur("on"), NOW);
    expect(r.status).toBe("mixed");
    expect(r.confidence).toBeLessThanOrEqual(0.5);
  });
  it("does NOT show Mixed when the minority is just one person", () => {
    const r = computeStatus([rep("a", "on"), rep("b", "on"), rep("c", "on"), rep("d", "off")], UNKNOWN, NOW);
    expect(r.status).toBe("on");
  });
  it("treats on and weak as the same side (not a conflict)", () => {
    const r = computeStatus([rep("a", "on"), rep("b", "on"), rep("c", "weak"), rep("d", "weak")], UNKNOWN, NOW);
    expect(r.status).not.toBe("mixed");
  });
  it("leaves Mixed once one side clearly wins", () => {
    const r = computeStatus([rep("a", "on"), rep("b", "on"), rep("c", "on"), rep("d", "on"), rep("e", "off", 1)], cur("mixed"), NOW);
    expect(r.status).toBe("on");
  });
});

describe("computeStatus: on <-> weak changes", () => {
  it("moves on -> weak when weak clearly dominates a busy spot", () => {
    const r = computeStatus([rep("a", "on", 180), rep("b", "weak"), rep("c", "weak"), rep("d", "weak")], cur("on", 180), NOW);
    expect(r.status).toBe("weak");
  });
  it("does not move on -> weak for a single weak report in a busy spot", () => {
    const r = computeStatus([rep("a", "on"), rep("b", "on"), rep("c", "on"), rep("d", "weak")], cur("on"), NOW);
    expect(r.status).toBe("on");
  });
});

describe("computeStatus: confidence and decay over time", () => {
  it("rises as more people agree", () => {
    const one = computeStatus([rep("a", "on")], UNKNOWN, NOW).confidence;
    const four = computeStatus([rep("a", "on"), rep("b", "on"), rep("c", "on"), rep("d", "on")], UNKNOWN, NOW).confidence;
    expect(four).toBeGreaterThan(one);
  });
  it("keeps the last status but marks it stale after staleAfterHours", () => {
    const r = computeStatus([], cur("on", 4 * 60), NOW);
    expect(r.status).toBe("on");
    expect(r.stale).toBe(true);
  });
  it("is not stale for a recent status", () => {
    expect(computeStatus([rep("a", "on", 10)], cur("on", 10), NOW).stale).toBe(false);
  });
  it("loses confidence as time passes without reports", () => {
    const at4h = computeStatus([], cur("on", 4 * 60), NOW).confidence;
    const at10h = computeStatus([], cur("on", 10 * 60), NOW).confidence;
    expect(at10h).toBeLessThan(at4h);
  });
  it("becomes Unknown after unknownAfterHours but remembers the last known status", () => {
    const r = computeStatus([], cur("on", 13 * 60), NOW);
    expect(r.status).toBe("unknown");
    expect(r.lastKnown).toBe("on");
    expect(r.confidence).toBe(0);
  });
  it("drops a Mixed status to Unknown when nobody reports for a while", () => {
    expect(computeStatus([], cur("mixed", 2 * 60), NOW).status).toBe("unknown");
  });
});

describe("isConfirmation", () => {
  it("is true when the report matches the current status", () => {
    expect(isConfirmation("on", "on")).toBe(true);
    expect(isConfirmation("off", "on")).toBe(false);
    expect(isConfirmation("unknown", "on")).toBe(false);
    expect(isConfirmation("mixed", "off")).toBe(false);
  });
});
