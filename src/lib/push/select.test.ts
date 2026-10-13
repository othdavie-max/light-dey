import { describe, expect, it } from "vitest";
import { alertKind, inQuietHours, selectRecipients, alertText, type Follower } from "./select";

const f = (o: Partial<Follower> = {}): Follower => ({ user_id: "u1", alert_on_come: true, alert_on_go: false, quiet_enabled: true, quiet_start: "23:00:00", quiet_end: "06:00:00", last_notified_at: null, ...o });
const noon = new Date("2026-10-13T11:00:00Z");      // 12:00 Lagos
const ev = (o = {}) => ({ oldStatus: "off" as const, newStatus: "on" as const, reporterId: "rep", now: noon, ...o });

describe("alertKind", () => {
  it("light returning after a cut is 'come'", () => { expect(alertKind("off", "on")).toBe("come"); expect(alertKind("off", "weak")).toBe("come"); });
  it("light going after having light is 'go'", () => { expect(alertKind("on", "off")).toBe("go"); expect(alertKind("weak", "off")).toBe("go"); });
  it("everything else is not news", () => {
    for (const [a, b] of [["unknown", "on"], ["on", "weak"], ["weak", "on"], ["on", "on"], ["off", "off"], ["on", "mixed"], ["mixed", "on"], ["off", "unknown"]] as const) expect(alertKind(a, b)).toBeNull();
  });
});

describe("inQuietHours (Lagos time, wraps midnight)", () => {
  it("23:00-06:00", () => {
    const at = (h: number, m = 0) => new Date(Date.UTC(2026, 9, 13, h - 1, m));      // Lagos h:m
    expect(inQuietHours(at(23, 0), "23:00:00", "06:00:00")).toBe(true);
    expect(inQuietHours(at(2), "23:00:00", "06:00:00")).toBe(true);
    expect(inQuietHours(at(5, 59), "23:00:00", "06:00:00")).toBe(true);
    expect(inQuietHours(at(6, 0), "23:00:00", "06:00:00")).toBe(false);
    expect(inQuietHours(at(12), "23:00:00", "06:00:00")).toBe(false);
    expect(inQuietHours(at(22, 59), "23:00:00", "06:00:00")).toBe(false);
  });
  it("same-day window and empty window", () => {
    expect(inQuietHours(new Date("2026-10-13T11:00:00Z"), "09:00:00", "17:00:00")).toBe(true);
    expect(inQuietHours(new Date("2026-10-13T11:00:00Z"), "12:00:00", "12:00:00")).toBe(false);
  });
});

describe("selectRecipients", () => {
  it("tells followers who asked for 'come'", () => expect(selectRecipients([f()], ev())).toEqual({ kind: "come", userIds: ["u1"] }));
  it("never tells the reporter", () => expect(selectRecipients([f({ user_id: "rep" })], ev())?.userIds).toEqual([]));
  it("respects the come/go switches", () => {
    expect(selectRecipients([f({ alert_on_come: false })], ev())?.userIds).toEqual([]);
    expect(selectRecipients([f()], ev({ oldStatus: "on", newStatus: "off" }))?.userIds).toEqual([]);
    expect(selectRecipients([f({ alert_on_go: true })], ev({ oldStatus: "on", newStatus: "off" }))?.userIds).toEqual(["u1"]);
  });
  it("respects the cooldown (29 min no, 31 min yes)", () => {
    const ago = (m: number) => new Date(noon.getTime() - m * 60_000).toISOString();
    expect(selectRecipients([f({ last_notified_at: ago(29) })], ev())?.userIds).toEqual([]);
    expect(selectRecipients([f({ last_notified_at: ago(31) })], ev())?.userIds).toEqual(["u1"]);
  });
  it("respects quiet hours unless switched off", () => {
    const night = new Date("2026-10-13T00:30:00Z");      // 01:30 Lagos
    expect(selectRecipients([f()], ev({ now: night }))?.userIds).toEqual([]);
    expect(selectRecipients([f({ quiet_enabled: false })], ev({ now: night }))?.userIds).toEqual(["u1"]);
  });
  it("returns null when it is not news", () => expect(selectRecipients([f()], ev({ oldStatus: "on", newStatus: "weak" }))).toBeNull());
});

describe("alertText", () => {
  it("names the spot without the whole-area suffix, in both languages", () => {
    expect(alertText("come", "Wuye (whole area)", "en").body).toBe("There is light in Wuye now.");
    expect(alertText("come", "Wuye", "pcm").title).toBe("Light don come!");
    expect(alertText("go", "Wuye", "pcm").body).toBe("Light no dey Wuye again.");
  });
});
