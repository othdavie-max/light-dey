export type BadgeCode = "nepa_watchman" | "generator_free_spirit" | "area_correspondent" | "night_shift_reporter" | "founding_reporter";

export interface BadgeFacts {
  streakCurrent: number;
  /** Reports of "light is on" this person has made (including the one just made). */
  onReports: number;
  /** Reports that changed what the spot was showing (not confirmations). */
  changeReports: number;
  /** This report, as Lagos wall-clock hour (0-23) and its status. */
  lastReport: { status: "on" | "off" | "weak"; at: Date };
  /** 1 = the very first profile ever created. */
  joinRank: number;
}

export const BADGE_RULES = { streakDays: 7, onReports: 10, changeReports: 10, nightFrom: 22, nightTo: 5, founders: 1000 } as const;

/** The Lagos hour (0-23) of a moment: Lagos is UTC+1 all year. */
export function lagosHour(d: Date): number {
  return (d.getUTCHours() + 1) % 24;
}

/** Every badge these facts qualify for. The caller saves only the ones not already held. */
export function badgesQualified(f: BadgeFacts): BadgeCode[] {
  const out: BadgeCode[] = [];
  if (f.streakCurrent >= BADGE_RULES.streakDays) out.push("nepa_watchman");
  if (f.onReports >= BADGE_RULES.onReports) out.push("generator_free_spirit");
  if (f.changeReports >= BADGE_RULES.changeReports) out.push("area_correspondent");
  const h = lagosHour(f.lastReport.at);
  if (f.lastReport.status === "on" && (h >= BADGE_RULES.nightFrom || h < BADGE_RULES.nightTo)) out.push("night_shift_reporter");
  if (f.joinRank >= 1 && f.joinRank <= BADGE_RULES.founders) out.push("founding_reporter");
  return out;
}
