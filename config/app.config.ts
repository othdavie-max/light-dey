// Every limit and threshold lives here so you can change it without touching logic.
export const appConfig = {
  // Reporting
  reportCooldownMinutes: 10,         // same person, same spot
  maxSavedSpots: 3,
  maxFollows: 3,
  quietHours: { start: "23:00", end: "06:00" },

  // Time. Africa/Lagos is UTC+1 all year (Nigeria has no daylight saving).
  displayTimezone: "Africa/Lagos",
  displayUtcOffsetMinutes: 60,

  // How a spot's status is worked out from recent reports
  status: {
    windowHours: 6,                  // reports older than this stop voting
    recencyHalfLifeMinutes: 60,      // a report's weight halves every hour
    staleAfterHours: 3,              // after this: "last confirmed X hours ago"
    unknownAfterHours: 12,           // after this: "Unknown. Be the first to report"
    quietMaxReporters: 2,            // this few recent reporters = a quiet spot
    flipSupportQuiet: 0.8,           // one fresh trusted reporter can change a quiet spot
    flipSupportBusy: 2.5,            // a busy spot needs real weight behind a change
    flipMargin: 1.0,                 // ...and at least this much times the weight of the old status
    acceptSupportFromUnknown: 0.5,   // first status for a spot with no current status
    mixedMinSupport: 1.5,            // BOTH sides need this much weight to show "Mixed"
    mixedMinShare: 0.3,              // ...and the smaller side needs this share of all weight
    confidenceSaturation: 2,         // total weight at which volume stops adding confidence
  },

  // Reporter trust (never shown publicly)
  trust: {
    start: 1.0,
    min: 0.2,
    max: 2.0,
    agreedBoost: 0.02,
    contradictedPenalty: 0.08,
    signedInMultiplier: 1.15,        // small boost for signed-in users
  },

  // Rate limits. Each rule: at most `max` reports per `windowSeconds`.
  rateLimits: {
    perUser:   { windowSeconds: 3600, max: 30 },
    perDevice: { windowSeconds: 3600, max: 30 },
    perIp:     { windowSeconds: 3600, max: 60 },
  },

  // Data quality: fewer reporters than this in a week = "limited data"
  minReportersForConfidentStats: 3,
};

export type AppConfig = typeof appConfig;
export type StatusConfig = AppConfig["status"];
