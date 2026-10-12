// Every limit and threshold lives here so you can change it without touching logic.
export const appConfig = {
  reportCooldownMinutes: 10,
  maxSavedSpots: 3,
  maxFollows: 3,
  unknownAfterHours: 12,
  staleAfterHours: 3,
  quietHours: { start: "23:00", end: "06:00" },
  displayTimezone: "Africa/Lagos",
};
