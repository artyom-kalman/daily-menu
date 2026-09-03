import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// 00:00 UTC = 09:00 KST. Retries continue every 30 min until 12:30 KST.
crons.daily(
  "fetch daily menus",
  { hourUTC: 0, minuteUTC: 0 },
  internal.menus.fetchAllForToday,
  {},
);

export default crons;
