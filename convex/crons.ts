import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// 21:00 UTC = 06:00 KST.
crons.daily(
  "fetch daily menus",
  { hourUTC: 21, minuteUTC: 0 },
  internal.menus.fetchAllForToday,
  {},
);

export default crons;
