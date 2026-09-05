import { addCalendarDays } from "./dates";

/** Keep menus and fetchAttempts newer than this many days. */
export const RETENTION_DAYS = 30;

/** 00:00 KST = 15:00 UTC. Separate from the 09:00 KST fetch cron. */
export const PRUNE_HOUR_UTC = 15;
export const PRUNE_MINUTE_UTC = 0;

export const PRUNE_PAGE_SIZE = 64;
export const PRUNE_MAX_BATCHES = 50;

/** Oldest YYYY-MM-DD that is still kept (today minus RETENTION_DAYS). */
export function retentionCutoffDate(
  todayYmd: string,
  retentionDays: number = RETENTION_DAYS,
): string {
  return addCalendarDays(todayYmd, -retentionDays);
}

/**
 * True when a stored row's KST `date` is older than the retention window.
 * Today's rows are never pruned.
 */
export function shouldPruneDate(
  dateYmd: string,
  todayYmd: string,
  retentionDays: number = RETENTION_DAYS,
): boolean {
  if (dateYmd === todayYmd) return false;
  return dateYmd < retentionCutoffDate(todayYmd, retentionDays);
}
