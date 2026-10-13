import { describe, expect, it } from "vitest";
import { enqueue, loadQueue, normalise, recordAttempt, remove, type StorageLike, type QueuedReport } from "./offlineQueue";
import { resolveReportTime } from "./status/reportTime";
import { evaluateReportAttempt } from "./ratelimit";

const NOW = new Date("2026-10-12T12:00:00Z").getTime();
const mins = (m: number) => NOW - m * 60_000;
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const SPOT = "11111111-1111-4111-8111-111111111111";

function fakeStorage(initial: Record<string, string> = {}): StorageLike & { data: Record<string, string> } {
  const data = { ...initial };
  return { data, getItem: (k) => data[k] ?? null, setItem: (k, v) => { data[k] = v; } };
}
const item = (n: number, at: number, status: "on" | "off" | "weak" = "on") => ({ clientId: id(n), spotId: SPOT, status, at });

describe("offline queue", () => {
  it("starts empty", () => {
    expect(loadQueue(fakeStorage(), NOW)).toEqual([]);
    expect(loadQueue(null, NOW)).toEqual([]);
  });
  it("saves a report and gives it back", () => {
    const s = fakeStorage();
    enqueue(s, item(1, mins(5)), NOW);
    expect(loadQueue(s, NOW)).toEqual([{ ...item(1, mins(5)), attempts: 0 }]);
  });
  it("keeps reports oldest first", () => {
    const s = fakeStorage();
    enqueue(s, item(1, mins(5)), NOW);
    enqueue(s, item(2, mins(30)), NOW);
    expect(loadQueue(s, NOW).map((r) => r.clientId)).toEqual([id(2), id(1)]);
  });
  it("never saves the same report twice", () => {
    const s = fakeStorage();
    enqueue(s, item(1, mins(5)), NOW);
    enqueue(s, item(1, mins(5)), NOW);
    expect(loadQueue(s, NOW)).toHaveLength(1);
  });
  it("drops reports older than the limit", () => {
    const s = fakeStorage();
    enqueue(s, item(1, mins(7 * 60)), NOW);
    enqueue(s, item(2, mins(60)), NOW);
    expect(loadQueue(s, NOW).map((r) => r.clientId)).toEqual([id(2)]);
  });
  it("keeps at most 20, dropping the oldest", () => {
    const s = fakeStorage();
    for (let n = 1; n <= 25; n++) enqueue(s, item(n, mins(100 - n)), NOW);
    const q = loadQueue(s, NOW);
    expect(q).toHaveLength(20);
    expect(q[0].clientId).toBe(id(6));
  });
  it("removes a sent report", () => {
    const s = fakeStorage();
    enqueue(s, item(1, mins(5)), NOW);
    enqueue(s, item(2, mins(4)), NOW);
    remove(s, id(1), NOW);
    expect(loadQueue(s, NOW).map((r) => r.clientId)).toEqual([id(2)]);
  });
  it("gives up on a report after too many failed tries", () => {
    const s = fakeStorage();
    enqueue(s, item(1, mins(5)), NOW);
    for (let i = 0; i < 4; i++) recordAttempt(s, id(1), NOW);
    expect(loadQueue(s, NOW)).toEqual([]);
  });
  it("counts tries without dropping the report early", () => {
    const s = fakeStorage();
    enqueue(s, item(1, mins(5)), NOW);
    recordAttempt(s, id(1), NOW);
    expect(loadQueue(s, NOW)[0].attempts).toBe(1);
  });
  it("survives corrupted or tampered storage", () => {
    expect(loadQueue(fakeStorage({ ld_report_queue: "not json" }), NOW)).toEqual([]);
    expect(loadQueue(fakeStorage({ ld_report_queue: "{}" }), NOW)).toEqual([]);
    const bad = JSON.stringify([{ clientId: "x", spotId: SPOT, status: "on", at: NOW, attempts: 0 }, { ...item(1, mins(1)), attempts: 0 }, { ...item(2, mins(1)), status: "banana", attempts: 0 }]);
    expect(loadQueue(fakeStorage({ ld_report_queue: bad }), NOW).map((r) => r.clientId)).toEqual([id(1)]);
  });
  it("normalise sorts and trims a raw list", () => {
    const raw: QueuedReport[] = [{ ...item(2, mins(1)), attempts: 0 }, { ...item(1, mins(9)), attempts: 0 }];
    expect(normalise(raw, NOW).map((r) => r.clientId)).toEqual([id(1), id(2)]);
  });
});

describe("resolveReportTime", () => {
  const now = new Date(NOW);
  it("uses the server clock when the phone sends no time", () => {
    expect(resolveReportTime(undefined, now)).toEqual({ ok: true, at: now, delayed: false });
  });
  it("accepts a saved report as of when it was made", () => {
    const r = resolveReportTime(mins(20), now);
    expect(r).toMatchObject({ ok: true, delayed: true });
    if (r.ok) expect(r.at.getTime()).toBe(mins(20));
  });
  it("does not call a report from seconds ago 'delayed'", () => {
    expect(resolveReportTime(NOW - 20_000, now)).toMatchObject({ ok: true, delayed: false });
  });
  it("rejects a time further back than the limit", () => {
    expect(resolveReportTime(mins(6 * 60 + 1), now)).toEqual({ ok: false, reason: "too_old" });
  });
  it("treats a phone clock a little ahead as now", () => {
    const r = resolveReportTime(NOW + 2 * 60_000, now);
    expect(r).toMatchObject({ ok: true, delayed: false });
    if (r.ok) expect(r.at.getTime()).toBe(NOW);
  });
  it("rejects a time well in the future", () => {
    expect(resolveReportTime(NOW + 30 * 60_000, now)).toEqual({ ok: false, reason: "bad_time" });
  });
  it("rejects things that are not times", () => {
    for (const bad of ["yesterday", NaN, Infinity, {}, true]) expect(resolveReportTime(bad, now)).toEqual({ ok: false, reason: "bad_time" });
  });
});

describe("cooldown uses when the report was made", () => {
  const base = { userHits: [], deviceHits: [], ipHits: [] };
  const now = new Date(NOW);
  it("measures the gap between when the two reports were made, not when they arrived", () => {
    // last report 40 min ago, saved report made 25 min ago: 15 minutes apart, allowed
    expect(evaluateReportAttempt({ ...base, now, eventAt: new Date(mins(25)), lastReportAtForSpot: new Date(mins(40)) }).allowed).toBe(true);
    // last report 30 min ago, saved report made 25 min ago: 5 minutes apart, blocked
    expect(evaluateReportAttempt({ ...base, now, eventAt: new Date(mins(25)), lastReportAtForSpot: new Date(mins(30)) })).toMatchObject({ allowed: false, reason: "cooldown" });
  });
  it("a saved report cannot slip in before the person's own earlier report", () => {
    expect(evaluateReportAttempt({ ...base, now, eventAt: new Date(mins(50)), lastReportAtForSpot: new Date(mins(40)) }).allowed).toBe(false);
  });
  it("still uses the server clock for everything else when no eventAt is given", () => {
    expect(evaluateReportAttempt({ ...base, now, lastReportAtForSpot: new Date(mins(1)) })).toMatchObject({ allowed: false, reason: "cooldown" });
  });
});
