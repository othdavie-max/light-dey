import { describe, expect, it } from "vitest";
import { rollupArea } from "./status/rollup";
import { dataQuality } from "./quality";
import { formatHours, weekdayLabel } from "./format";

describe("rollupArea", () => {
  it("is unknown when no spot has a status", () => {
    expect(rollupArea(["unknown", "unknown"]).state).toBe("unknown");
    expect(rollupArea([]).state).toBe("unknown");
  });
  it("is mostly on when most known spots have light", () => {
    expect(rollupArea(["on", "on", "on", "off"]).state).toBe("mostly_on");   // 75%
  });
  it("counts weak light as light", () => {
    expect(rollupArea(["weak", "on", "weak"]).state).toBe("mostly_on");
  });
  it("is mostly off when most known spots are dark", () => {
    expect(rollupArea(["off", "off", "off", "on"]).state).toBe("mostly_off");
  });
  it("is mixed when neither side has enough", () => {
    expect(rollupArea(["on", "off"]).state).toBe("mixed");
    expect(rollupArea(["on", "on", "off", "off", "off"]).state).toBe("mixed");  // 60/40
  });
  it("ignores spots nobody has reported on (they are not counted as dark)", () => {
    const r = rollupArea(["on", "unknown", "unknown", "unknown"]);
    expect(r).toMatchObject({ state: "mostly_on", known: 1, total: 4 });
  });
  it("treats a mixed spot as known but on neither side", () => {
    expect(rollupArea(["on", "mixed", "mixed"]).state).toBe("mixed");
  });
  it("respects a changed threshold", () => {
    expect(rollupArea(["on", "on", "off"], { mostlyShare: 0.6 }).state).toBe("mostly_on");
  });
});

describe("dataQuality", () => {
  it("is low with too few reporters", () => {
    expect(dataQuality(1, 0.9)).toBe("low");
    expect(dataQuality(2, 1)).toBe("low");
  });
  it("is low when little of the week is known", () => {
    expect(dataQuality(20, 0.2)).toBe("low");
  });
  it("is ok in between", () => {
    expect(dataQuality(5, 0.6)).toBe("ok");
    expect(dataQuality(10, 0.5)).toBe("ok");
  });
  it("is good with many reporters and good coverage", () => {
    expect(dataQuality(12, 0.8)).toBe("good");
  });
});

describe("formatting", () => {
  it("names the weekday of a Lagos day key", () => {
    expect(weekdayLabel("2026-10-12")).toBe("Mon");
    expect(weekdayLabel("2026-10-18")).toBe("Sun");
  });
  it("formats hours", () => {
    expect(formatHours(9)).toBe("9h");
    expect(formatHours(3.3333)).toBe("3h 20m");
    expect(formatHours(0.75)).toBe("45m");
    expect(formatHours(0)).toBe("0m");
  });
});
