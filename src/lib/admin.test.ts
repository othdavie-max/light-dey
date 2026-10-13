import { describe, expect, it } from "vitest";
import { agoShort, suspicionReasons } from "./admin";

const calm = { reports: 12, spots: 2, devices: 1, networks: 1, max_per_hour: 3, share_off: 0.5, open_flags: 0 };

describe("suspicionReasons", () => {
  it("has nothing to say about an ordinary reporter", () => {
    expect(suspicionReasons(calm)).toEqual([]);
  });
  it("notices a burst of reports in one hour", () => {
    expect(suspicionReasons({ ...calm, max_per_hour: 20 })).toEqual(["20 reports in one hour"]);
  });
  it("notices many phones or networks on one account", () => {
    const r = suspicionReasons({ ...calm, devices: 5, networks: 6 });
    expect(r).toContain("5 different phones");
    expect(r).toContain("6 different networks");
  });
  it("notices an account whose reports almost all say the same thing", () => {
    expect(suspicionReasons({ ...calm, reports: 30, share_off: 1 })).toEqual(["almost every report says 'no light'"]);
    expect(suspicionReasons({ ...calm, reports: 30, share_off: 0 })).toEqual(["almost every report says 'light is on'"]);
  });
  it("does not judge one-sidedness on a handful of reports", () => {
    expect(suspicionReasons({ ...calm, reports: 4, share_off: 1 })).toEqual([]);
  });
  it("mentions open flags", () => {
    expect(suspicionReasons({ ...calm, open_flags: 1 })).toEqual(["1 open flag"]);
    expect(suspicionReasons({ ...calm, open_flags: 3 })).toEqual(["3 open flags"]);
  });
  it("accepts numbers that arrive as text (the database sends big counts as strings)", () => {
    expect(suspicionReasons({ reports: "40", spots: "2", devices: "6", networks: "1", max_per_hour: "2", share_off: "0.5", open_flags: "0" })).toEqual(["6 different phones"]);
  });
  it("respects changed thresholds", () => {
    expect(suspicionReasons({ ...calm, max_per_hour: 5 }, { maxPerHour: 5, devices: 4, networks: 5, minReportsForOneSidedCheck: 15, oneSidedShare: 0.95 })).toHaveLength(1);
  });
});

describe("agoShort", () => {
  const now = new Date("2026-10-13T12:00:00Z").getTime();
  it("describes how long ago in a few characters", () => {
    expect(agoShort("2026-10-13T11:59:50Z", now)).toBe("now");
    expect(agoShort("2026-10-13T11:55:00Z", now)).toBe("5m");
    expect(agoShort("2026-10-13T09:00:00Z", now)).toBe("3h");
    expect(agoShort("2026-10-10T12:00:00Z", now)).toBe("3d");
    expect(agoShort(null, now)).toBe("–");
  });
});
