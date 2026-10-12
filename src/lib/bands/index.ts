import { appConfig } from "../../../config/app.config";

export type Band = "A" | "B" | "C" | "D" | "E";
export interface BandThreshold { band: Band; minHoursPerDay: number; effectiveDate: string }   // YYYY-MM-DD

/** For each band, the newest threshold whose effective date has arrived. Thresholds live in the band_thresholds table. */
export function currentThresholds(rows: BandThreshold[], onDate: string): Partial<Record<Band, number>> {
  const out: Partial<Record<Band, { date: string; hours: number }>> = {};
  for (const r of rows) {
    if (r.effectiveDate > onDate) continue;
    const prev = out[r.band];
    if (!prev || r.effectiveDate > prev.date) out[r.band] = { date: r.effectiveDate, hours: r.minHoursPerDay };
  }
  return Object.fromEntries(Object.entries(out).map(([b, v]) => [b, v!.hours]));
}

export interface BandCheck {
  band: Band;
  promisedHours: number;
  actualHours: number;
  /** actual minus promised; negative means the area got less than promised. */
  gapHours: number;
  meets: boolean;
  /** Not enough reporters or known time to say anything fair. Show a caution, not a verdict. */
  lowConfidence: boolean;
}

/**
 * Compares measured hours with what a tariff band promises per day.
 * `reporters` and `coverage` come from the weekly stats; with too little data we flag low confidence.
 */
export function compareToBand(
  band: Band,
  avgLightHoursPerDay: number | null,
  thresholds: Partial<Record<Band, number>>,
  data: { reporters: number; coverage: number },
): BandCheck | null {
  const promised = thresholds[band];
  if (promised === undefined || avgLightHoursPerDay === null) return null;
  return {
    band,
    promisedHours: promised,
    actualHours: avgLightHoursPerDay,
    gapHours: Math.round((avgLightHoursPerDay - promised) * 10) / 10,
    meets: avgLightHoursPerDay >= promised,
    lowConfidence: data.reporters < appConfig.minReportersForConfidentStats || data.coverage < 0.5,
  };
}
