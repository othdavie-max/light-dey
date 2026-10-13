// Every limit and threshold lives here so you can change it without touching logic.
export const appConfig = {
  // Details shown on the Privacy, Terms and About pages. Anything in [square brackets] is a placeholder:
  // replace it with your real details before launch (`npm run launch-check` lists what is still missing).
  legal: {
    operatorName: "[Your registered business name]",
    contactEmail: "[your contact email address]",
    address: "[Your business address, Nigeria]",
    governingCity: "[Lagos or Abuja]",              // whose courts handle disputes
    effectiveDate: "2026-10-14",                    // change when the text changes
    version: "2026-10-14",                          // people agree to a version; bump it when the text changes
  },

  // Cloudflare Turnstile SITE key. Public by design (it sits in the web page); the SECRET key never goes here.
  // NEXT_PUBLIC_TURNSTILE_SITE_KEY, if set, takes priority.
  turnstileSiteKey: "0x4AAAAAAFVjYUjMWxYVwnFa",

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

  // Points (payouts come in Phase 4; this only counts)
  points: {
    report: 10,
    confirmation: 2,                 // same status as already showing
    firstToReportChange: 5,          // bonus for being the one whose report changed the status
  },

  // Rate limits. Each rule: at most `max` reports per `windowSeconds`.
  rateLimits: {
    perUser:   { windowSeconds: 3600, max: 30 },
    perDevice: { windowSeconds: 3600, max: 30 },
    perIp:     { windowSeconds: 3600, max: 60 },
  },

  // Reports made while offline are saved on the phone and sent when the network returns.
  offline: {
    maxAgeHours: 6,                  // older than this, a saved report is dropped (it no longer describes the present)
    maxQueue: 20,                    // most reports kept waiting
    maxAttempts: 4,                  // tries before a stuck report is dropped
    retryEverySeconds: 15,           // how often to try again while reports are waiting
    futureToleranceMinutes: 5,       // a phone clock this far ahead is treated as "now"
  },

  // Data quality: fewer reporters than this in a week = "limited data"
  minReportersForConfidentStats: 3,
  dataQuality: {
    goodReporters: 10,               // this many people in a week (and enough coverage) = "good"
    goodCoverage: 0.7,               // share of the week we actually know about
    lowCoverage: 0.4,                // below this share = "low", however many people reported
  },

  // The admin "Reporters" tab highlights people who look like they could be abusing the app.
  admin: {
    suspicious: {
      maxPerHour: 12,                // this many reports in a single hour
      devices: 4,                    // this many different phones on one account
      networks: 5,                   // this many different internet connections
      minReportsForOneSidedCheck: 15,// with at least this many reports...
      oneSidedShare: 0.95,           // ...nearly all saying the same thing is odd
    },
  },

  // An area is "mostly on" or "mostly off" when this share of its spots (that we know about) agree.
  areaRollup: { mostlyShare: 0.7 },
};

export type AppConfig = typeof appConfig;
export type StatusConfig = AppConfig["status"];
