// KST helpers. Korea has no DST, so a fixed +09:00 offset is correct.

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** Returns a Date whose UTC fields equal the current KST wall-clock fields. */
function nowAsKstWallClock(): Date {
  return new Date(Date.now() + KST_OFFSET_MS);
}

/** YYYY-MM-DD for the current KST date. */
export function todayKst(): string {
  return formatKstDate(nowAsKstWallClock());
}

/** Day of week for a KST wall-clock Date. 0=Sun..6=Sat. */
export function kstWeekday(date: Date): number {
  return date.getUTCDay();
}

/** Formats a KST wall-clock Date to YYYY-MM-DD. */
export function formatKstDate(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Current KST hour and minute, as numbers. */
export function kstHourMinute(): { hour: number; minute: number } {
  const d = nowAsKstWallClock();
  return { hour: d.getUTCHours(), minute: d.getUTCMinutes() };
}

/** Current KST wall-clock Date (UTC fields = KST fields). */
export function kstNow(): Date {
  return nowAsKstWallClock();
}
