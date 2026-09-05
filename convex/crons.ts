import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";
import { PRUNE_HOUR_UTC, PRUNE_MINUTE_UTC } from "./prunePolicy";

const crons = cronJobs();

// 00:00 UTC = 09:00 KST. Retries continue every 30 min until 12:30 KST.
crons.daily(
  "fetch daily menus",
  { hourUTC: 0, minuteUTC: 0 },
  internal.menus.fetchAllForToday,
  {},
);

// 15:00 UTC = 00:00 KST. Deletes menus and fetchAttempts older than 30 days.
crons.daily(
  "prune old menus and fetch attempts",
  { hourUTC: PRUNE_HOUR_UTC, minuteUTC: PRUNE_MINUTE_UTC },
  internal.prune.pruneOldData,
  {},
);

export default crons;
