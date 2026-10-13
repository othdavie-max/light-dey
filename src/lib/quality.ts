import { appConfig } from "../../config/app.config";

export type Quality = "low" | "ok" | "good";

/**
 * How much to trust a spot's weekly numbers. Based on how many different people reported and how much
 * of the week we actually know about (see summarisePeriod's `coverage`).
 */
export function dataQuality(reporters: number, coverage: number, cfg = appConfig.dataQuality): Quality {
  if (reporters < appConfig.minReportersForConfidentStats || coverage < cfg.lowCoverage) return "low";
  if (reporters >= cfg.goodReporters && coverage >= cfg.goodCoverage) return "good";
  return "ok";
}
