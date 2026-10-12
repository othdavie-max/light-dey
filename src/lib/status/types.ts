export type ReportStatus = "on" | "off" | "weak";
export type SpotState = ReportStatus | "mixed" | "unknown";

export interface ReportInput {
  status: ReportStatus;
  createdAt: Date;
  /** Reporter trust after the signed-in boost has been applied (see trust.ts). */
  trust: number;
  /** User id, or device id for anonymous people. Only a reporter's latest report counts. */
  reporterId: string;
}

export interface CurrentStatus {
  status: SpotState;
  since: Date | null;
  lastReportAt: Date | null;
}

export interface ComputedStatus {
  status: SpotState;
  /** 0 to 1. Rises with agreement and volume, falls as reports get old. */
  confidence: number;
  /** True when the newest report is older than staleAfterHours. */
  stale: boolean;
  /** The last on/off/weak we trusted. Shown as "last known" when status is unknown. */
  lastKnown: ReportStatus | null;
  lastReportAt: Date | null;
  weights: { on: number; weak: number; off: number };
  reporters: number;
}

export interface SupplySession {
  id?: number;
  status: ReportStatus;
  startedAt: Date;
  endedAt: Date | null;
  /** Newest report that agreed with this session. Time after this + unknownAfterHours counts as unknown. */
  lastConfirmedAt: Date;
}
