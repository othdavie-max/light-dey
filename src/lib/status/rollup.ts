import { appConfig } from "../../../config/app.config";
import type { SpotState } from "./types";

export type AreaState = "mostly_on" | "mostly_off" | "mixed" | "unknown";

export interface AreaRollup {
  state: AreaState;
  /** Spots with light of some kind (on or weak). */
  light: number;
  off: number;
  /** Spots we have any status for (everything except "unknown"). */
  known: number;
  total: number;
}

/**
 * An area's status is worked out from its spots: "mostly on" or "mostly off" when enough of the spots
 * we know about agree, otherwise "mixed". Spots nobody has reported on are left out, not counted as dark.
 */
export function rollupArea(statuses: SpotState[], cfg = appConfig.areaRollup): AreaRollup {
  const light = statuses.filter((s) => s === "on" || s === "weak").length;
  const off = statuses.filter((s) => s === "off").length;
  const known = statuses.filter((s) => s !== "unknown").length;
  let state: AreaState = "mixed";
  if (known === 0) state = "unknown";
  else if (light / known >= cfg.mostlyShare) state = "mostly_on";
  else if (off / known >= cfg.mostlyShare) state = "mostly_off";
  return { state, light, off, known, total: statuses.length };
}
