import { appConfig } from "../../config/app.config";

/** "3hrs 12mins", "12mins", "2days 4hrs". */
export function formatDuration(ms: number): string {
  const mins = Math.max(0, Math.floor(ms / 60_000));
  if (mins < 60) return `${mins}mins`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}hrs ${mins % 60}mins`;
  return `${Math.floor(hrs / 24)}days ${hrs % 24}hrs`;
}

/** "3hrs", "25mins": a rough "how long ago". */
export function formatAgo(ms: number): string {
  const mins = Math.max(0, Math.floor(ms / 60_000));
  if (mins < 60) return `${mins}mins`;
  const hrs = Math.floor(mins / 60);
  return hrs < 24 ? `${hrs}hrs` : `${Math.floor(hrs / 24)}days`;
}

/** Short weekday for a Lagos calendar day key like "2026-10-12" (a Monday): "Mon". */
export function weekdayLabel(dayKey: string): string {
  return new Date(`${dayKey}T12:00:00Z`).toLocaleDateString("en-NG", { weekday: "short", timeZone: "UTC" });
}

/** Hours as "3h 20m", "45m" or "9h". */
export function formatHours(hours: number): string {
  const total = Math.round(hours * 60);
  const h = Math.floor(total / 60), m = total % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

/** Clock time in Lagos, e.g. "7:40 PM". */
export function formatLagosTime(date: Date): string {
  return date.toLocaleTimeString("en-NG", { hour: "numeric", minute: "2-digit", timeZone: appConfig.displayTimezone });
}
