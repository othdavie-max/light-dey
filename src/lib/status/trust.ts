import { appConfig } from "../../../config/app.config";

type TrustConfig = typeof appConfig.trust;

/** The weight a reporter's votes carry: their trust, with a small boost for signed-in people. */
export function reporterTrust(trust: number, signedIn: boolean, cfg: TrustConfig = appConfig.trust): number {
  return trust * (signedIn ? cfg.signedInMultiplier : 1);
}

/**
 * Later consensus feeds back into trust: reports that matched it earn a little,
 * repeatedly contradicted ones lose more. Stays within [min, max].
 */
export function adjustTrust(trust: number, outcome: "agreed" | "contradicted", cfg: TrustConfig = appConfig.trust): number {
  const next = outcome === "agreed" ? trust + cfg.agreedBoost : trust - cfg.contradictedPenalty;
  return Math.round(Math.min(cfg.max, Math.max(cfg.min, next)) * 1000) / 1000;
}
