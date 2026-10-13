import { appConfig } from "../../config/app.config";

export interface ReporterRow {
  reports: number | string;
  spots: number | string;
  devices: number | string;
  networks: number | string;
  max_per_hour: number | string;
  share_off: number | string | null;
  open_flags?: number | string;
}

/**
 * Why a reporter might need a closer look. These are hints for the admin, not verdicts: people with a busy
 * day or several phones are often perfectly honest. Thresholds live in config/app.config.ts.
 */
export function suspicionReasons(r: ReporterRow, cfg = appConfig.admin.suspicious): string[] {
  const n = (v: number | string | null | undefined) => Number(v ?? 0);
  const out: string[] = [];
  if (n(r.max_per_hour) >= cfg.maxPerHour) out.push(`${n(r.max_per_hour)} reports in one hour`);
  if (n(r.devices) >= cfg.devices) out.push(`${n(r.devices)} different phones`);
  if (n(r.networks) >= cfg.networks) out.push(`${n(r.networks)} different networks`);
  if (n(r.reports) >= cfg.minReportsForOneSidedCheck && r.share_off !== null) {
    const off = n(r.share_off);
    if (off >= cfg.oneSidedShare) out.push("almost every report says 'no light'");
    if (off <= 1 - cfg.oneSidedShare) out.push("almost every report says 'light is on'");
  }
  if (n(r.open_flags) > 0) out.push(`${n(r.open_flags)} open flag${n(r.open_flags) === 1 ? "" : "s"}`);
  return out;
}

/** "5m", "3h", "2d": how long ago, for tight admin tables. */
export function agoShort(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return "–";
  const mins = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60_000));
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  return h < 48 ? `${h}h` : `${Math.floor(h / 24)}d`;
}
