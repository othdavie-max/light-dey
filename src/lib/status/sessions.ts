import type { ReportStatus, SpotState, SupplySession } from "./types";

/** What the server should do to the supply_sessions table after a status is computed. */
export type SessionPlan =
  | { type: "none" }
  /** The open session was agreed with again: just refresh its last_confirmed_at. */
  | { type: "confirm"; lastConfirmedAt: Date }
  /** Nothing was open: start a session. */
  | { type: "open"; open: NewSession }
  /** Status changed: end the open session and start a new one. */
  | { type: "change"; endedAt: Date; open: NewSession };

export interface NewSession {
  status: ReportStatus;
  startedAt: Date;
  lastConfirmedAt: Date;
}

/**
 * Every confirmed change becomes a supply session (start, end, status). Sessions are the source of
 * truth for "hours of light". "mixed" and "unknown" never open or close a session: they mean
 * "we are not sure", not "the supply changed".
 */
export function planSessionUpdate(open: SupplySession | null, newStatus: SpotState, at: Date): SessionPlan {
  if (newStatus !== "on" && newStatus !== "off" && newStatus !== "weak") return { type: "none" };

  const fresh: NewSession = { status: newStatus, startedAt: at, lastConfirmedAt: at };
  if (!open) return { type: "open", open: fresh };

  if (open.status === newStatus) {
    return { type: "confirm", lastConfirmedAt: at > open.lastConfirmedAt ? at : open.lastConfirmedAt };
  }

  // The database requires ended_at > started_at, so a report with a skewed clock cannot end a session before it began.
  const endedAt = at > open.startedAt ? at : new Date(open.startedAt.getTime() + 1000);
  return { type: "change", endedAt, open: { status: newStatus, startedAt: endedAt, lastConfirmedAt: endedAt } };
}
