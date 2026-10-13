import { appConfig } from "../../../config/app.config";

export type Spotstate = "on" | "off" | "weak" | "mixed" | "unknown";
export type AlertKind = "come" | "go";

export interface Follower {
  user_id: string;
  alert_on_come: boolean;
  alert_on_go: boolean;
  quiet_enabled: boolean;
  quiet_start: string;            // "23:00:00"
  quiet_end: string;              // "06:00:00"
  last_notified_at: string | null;
}

/** "come" when light returns after a cut, "go" when it is cut after having light. Anything else is not news. */
export function alertKind(oldStatus: Spotstate, newStatus: Spotstate): AlertKind | null {
  if (oldStatus === "off" && (newStatus === "on" || newStatus === "weak")) return "come";
  if ((oldStatus === "on" || oldStatus === "weak") && newStatus === "off") return "go";
  return null;
}

const minutesOf = (t: string) => { const [h, m] = t.split(":").map(Number); return (h || 0) * 60 + (m || 0); };

/** Is this Lagos wall-clock time inside the quiet window? Windows may wrap midnight (23:00 to 06:00). */
export function inQuietHours(now: Date, start: string, end: string): boolean {
  const cur = ((now.getUTCHours() + 1) % 24) * 60 + now.getUTCMinutes();     // Lagos is UTC+1
  const s = minutesOf(start), e = minutesOf(end);
  if (s === e) return false;
  return s < e ? cur >= s && cur < e : cur >= s || cur < e;
}

/** Who should be told? Never the reporter, never someone asked recently, never during their quiet hours. */
export function selectRecipients(
  followers: Follower[],
  event: { oldStatus: Spotstate; newStatus: Spotstate; reporterId: string; now: Date },
  cooldownMinutes = appConfig.push.cooldownMinutes,
): { kind: AlertKind; userIds: string[] } | null {
  const kind = alertKind(event.oldStatus, event.newStatus);
  if (!kind) return null;
  const userIds = followers.filter((f) => {
    if (f.user_id === event.reporterId) return false;
    if (!(kind === "come" ? f.alert_on_come : f.alert_on_go)) return false;
    if (f.last_notified_at && event.now.getTime() - new Date(f.last_notified_at).getTime() < cooldownMinutes * 60_000) return false;
    if (f.quiet_enabled && inQuietHours(event.now, f.quiet_start, f.quiet_end)) return false;
    return true;
  }).map((f) => f.user_id);
  return { kind, userIds };
}

export function alertText(kind: AlertKind, spotName: string, lang: "en" | "pcm", weak = false) {
  const name = spotName.replace(/ \(whole area\)$/, "");
  if (kind === "come") {
    return lang === "en"
      ? { title: weak ? "Light is back (weak)" : "Light don come!", body: `There is light in ${name} now.` }
      : { title: weak ? "Light don come (e weak)" : "Light don come!", body: `Light dey ${name} now.` };
  }
  return lang === "en"
    ? { title: "Light don go", body: `No light in ${name} now.` }
    : { title: "Light don go", body: `Light no dey ${name} again.` };
}
