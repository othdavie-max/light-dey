import { describe, expect, it } from "vitest";
import { planSessionUpdate } from "./sessions";
import type { SupplySession } from "./types";

const t = (s: string) => new Date(s);
const open = (status: SupplySession["status"], start: string, confirmed = start): SupplySession => ({
  id: 1, status, startedAt: t(start), endedAt: null, lastConfirmedAt: t(confirmed),
});

describe("planSessionUpdate", () => {
  it("starts a session when none is open", () => {
    const p = planSessionUpdate(null, "on", t("2026-10-12T10:00:00Z"));
    expect(p).toEqual({ type: "open", open: { status: "on", startedAt: t("2026-10-12T10:00:00Z"), lastConfirmedAt: t("2026-10-12T10:00:00Z") } });
  });

  it("refreshes last_confirmed_at when the same status is confirmed", () => {
    const p = planSessionUpdate(open("on", "2026-10-12T10:00:00Z"), "on", t("2026-10-12T11:00:00Z"));
    expect(p).toEqual({ type: "confirm", lastConfirmedAt: t("2026-10-12T11:00:00Z") });
  });

  it("never moves last_confirmed_at backwards", () => {
    const p = planSessionUpdate(open("on", "2026-10-12T10:00:00Z", "2026-10-12T12:00:00Z"), "on", t("2026-10-12T11:00:00Z"));
    expect(p).toMatchObject({ type: "confirm", lastConfirmedAt: t("2026-10-12T12:00:00Z") });
  });

  it("closes the old session and opens a new one on a change", () => {
    const p = planSessionUpdate(open("on", "2026-10-12T10:00:00Z"), "off", t("2026-10-12T13:00:00Z"));
    expect(p).toMatchObject({ type: "change", endedAt: t("2026-10-12T13:00:00Z"), open: { status: "off", startedAt: t("2026-10-12T13:00:00Z") } });
  });

  it("treats on -> weak as a change too", () => {
    expect(planSessionUpdate(open("on", "2026-10-12T10:00:00Z"), "weak", t("2026-10-12T11:00:00Z")).type).toBe("change");
  });

  it("does nothing for mixed or unknown (not sure is not a change)", () => {
    expect(planSessionUpdate(open("on", "2026-10-12T10:00:00Z"), "mixed", t("2026-10-12T11:00:00Z")).type).toBe("none");
    expect(planSessionUpdate(null, "unknown", t("2026-10-12T11:00:00Z")).type).toBe("none");
  });

  it("never ends a session before it started (clock skew)", () => {
    const p = planSessionUpdate(open("on", "2026-10-12T10:00:00Z"), "off", t("2026-10-12T09:00:00Z"));
    expect(p.type).toBe("change");
    if (p.type === "change") expect(p.endedAt.getTime()).toBeGreaterThan(t("2026-10-12T10:00:00Z").getTime());
  });
});
