import { describe, expect, it } from "vitest";
import { compareToBand, currentThresholds, type BandThreshold } from "./index";
import { adjustTrust, reporterTrust } from "../status/trust";

const rows: BandThreshold[] = [
  { band: "A", minHoursPerDay: 20, effectiveDate: "2024-04-03" },
  { band: "B", minHoursPerDay: 16, effectiveDate: "2024-04-03" },
  { band: "A", minHoursPerDay: 18, effectiveDate: "2027-01-01" },   // a future change
];

describe("currentThresholds", () => {
  it("uses the newest threshold that has already taken effect", () => {
    expect(currentThresholds(rows, "2026-10-12")).toEqual({ A: 20, B: 16 });
    expect(currentThresholds(rows, "2027-02-01").A).toBe(18);
  });
  it("returns nothing before any threshold is effective", () => {
    expect(currentThresholds(rows, "2020-01-01")).toEqual({});
  });
});

describe("compareToBand", () => {
  const thresholds = { A: 20, B: 16, C: 12, D: 8, E: 4 };
  const good = { reporters: 10, coverage: 0.9 };

  it("flags an area that gets less than a Band A promise", () => {
    const c = compareToBand("A", 11.4, thresholds, good)!;
    expect(c).toMatchObject({ promisedHours: 20, actualHours: 11.4, gapHours: -8.6, meets: false, lowConfidence: false });
  });
  it("passes an area that meets its band", () => {
    const c = compareToBand("C", 13, thresholds, good)!;
    expect(c.meets).toBe(true);
    expect(c.gapHours).toBe(1);
  });
  it("counts exactly meeting the promise as meeting it", () => {
    expect(compareToBand("B", 16, thresholds, good)!.meets).toBe(true);
  });
  it("warns about low confidence with too few reporters", () => {
    expect(compareToBand("A", 11, thresholds, { reporters: 1, coverage: 0.9 })!.lowConfidence).toBe(true);
  });
  it("warns about low confidence when little time is known", () => {
    expect(compareToBand("A", 11, thresholds, { reporters: 10, coverage: 0.2 })!.lowConfidence).toBe(true);
  });
  it("gives no verdict without data or without a threshold", () => {
    expect(compareToBand("A", null, thresholds, good)).toBeNull();
    expect(compareToBand("A", 10, {}, good)).toBeNull();
  });
});

describe("trust score", () => {
  it("gives signed-in people a small boost", () => {
    expect(reporterTrust(1, true)).toBeCloseTo(1.15);
    expect(reporterTrust(1, false)).toBe(1);
  });
  it("rises when a report matches later consensus", () => {
    expect(adjustTrust(1, "agreed")).toBeGreaterThan(1);
  });
  it("falls faster when contradicted", () => {
    expect(1 - adjustTrust(1, "contradicted")).toBeGreaterThan(adjustTrust(1, "agreed") - 1);
  });
  it("stays within the minimum and maximum", () => {
    expect(adjustTrust(0.21, "contradicted")).toBe(0.2);
    expect(adjustTrust(1.99, "agreed")).toBe(2);
  });
});
