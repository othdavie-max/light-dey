import { appConfig } from "../../config/app.config";
import { lagosDayKey } from "./status/hours";

export interface RewardState {
  points: number;
  streakCurrent: number;
  streakBest: number;
  lastReportDay: string | null;   // Lagos calendar day, YYYY-MM-DD
}

export interface RewardResult extends RewardState {
  pointsAwarded: number;
}

/**
 * Points and streak after one report.
 * - A report earns `report` points; repeating the status already showing (a confirmation) earns fewer.
 * - The reporter whose report changed the status earns a bonus.
 * - Reporting on consecutive Lagos days grows the streak; a missed day resets it to 1.
 */
export function applyReport(
  state: RewardState,
  event: { isConfirmation: boolean; changedStatus: boolean; now: Date },
  cfg = appConfig.points,
): RewardResult {
  const today = lagosDayKey(event.now);
  const yesterday = lagosDayKey(new Date(event.now.getTime() - 24 * 3_600_000));

  let streak = state.streakCurrent;
  if (state.lastReportDay === today) streak = Math.max(1, streak);
  else if (state.lastReportDay === yesterday) streak = streak + 1;
  else streak = 1;

  const pointsAwarded = (event.isConfirmation ? cfg.confirmation : cfg.report) + (event.changedStatus ? cfg.firstToReportChange : 0);
  return {
    pointsAwarded,
    points: state.points + pointsAwarded,
    streakCurrent: streak,
    streakBest: Math.max(state.streakBest, streak),
    lastReportDay: today,
  };
}
