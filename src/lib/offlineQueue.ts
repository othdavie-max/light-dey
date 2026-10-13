import { appConfig } from "../../config/app.config";
import type { ReportStatus } from "./status/types";

export interface QueuedReport {
  /** Random id made on the phone; the server uses it to ignore duplicates. */
  clientId: string;
  spotId: string;
  status: ReportStatus;
  /** When the person actually tapped (ms since 1970). */
  at: number;
  attempts: number;
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const KEY = "ld_report_queue";
const STATUSES = ["on", "off", "weak"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Cfg = typeof appConfig.offline;

function isValid(x: unknown): x is QueuedReport {
  if (!x || typeof x !== "object") return false;
  const r = x as Record<string, unknown>;
  return typeof r.clientId === "string" && UUID.test(r.clientId) && typeof r.spotId === "string" && UUID.test(r.spotId)
    && typeof r.status === "string" && STATUSES.includes(r.status)
    && typeof r.at === "number" && Number.isFinite(r.at) && typeof r.attempts === "number";
}

/** Reports still worth sending: oldest first, nothing older than the limit, never more than `maxQueue`. */
export function normalise(list: QueuedReport[], now: number, cfg: Cfg = appConfig.offline): QueuedReport[] {
  const cutoff = now - cfg.maxAgeHours * 3_600_000;
  const fresh = list.filter((r) => r.at >= cutoff && r.attempts < cfg.maxAttempts).sort((a, b) => a.at - b.at);
  return fresh.slice(Math.max(0, fresh.length - cfg.maxQueue));
}

export function loadQueue(storage: StorageLike | null, now = Date.now(), cfg: Cfg = appConfig.offline): QueuedReport[] {
  if (!storage) return [];
  try {
    const raw = JSON.parse(storage.getItem(KEY) ?? "[]");
    return Array.isArray(raw) ? normalise(raw.filter(isValid), now, cfg) : [];
  } catch {
    return [];
  }
}

function save(storage: StorageLike | null, list: QueuedReport[]) {
  try { storage?.setItem(KEY, JSON.stringify(list)); } catch { /* storage full or blocked: the queue lasts for this visit only */ }
}

export function enqueue(storage: StorageLike | null, item: Omit<QueuedReport, "attempts">, now = Date.now(), cfg: Cfg = appConfig.offline): QueuedReport[] {
  const list = loadQueue(storage, now, cfg).filter((r) => r.clientId !== item.clientId);
  const next = normalise([...list, { ...item, attempts: 0 }], now, cfg);
  save(storage, next);
  return next;
}

export function remove(storage: StorageLike | null, clientId: string, now = Date.now(), cfg: Cfg = appConfig.offline): QueuedReport[] {
  const next = loadQueue(storage, now, cfg).filter((r) => r.clientId !== clientId);
  save(storage, next);
  return next;
}

/** Count a failed try. After `maxAttempts` the report is dropped by `normalise`. */
export function recordAttempt(storage: StorageLike | null, clientId: string, now = Date.now(), cfg: Cfg = appConfig.offline): QueuedReport[] {
  const next = normalise(
    loadQueue(storage, now, cfg).map((r) => (r.clientId === clientId ? { ...r, attempts: r.attempts + 1 } : r)),
    now, cfg,
  );
  save(storage, next);
  return next;
}
