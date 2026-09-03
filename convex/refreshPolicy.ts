export const FETCH_START_HOUR = 9;
export const FETCH_START_MINUTE = 0;
export const CUTOFF_HOUR = 12;
export const CUTOFF_MINUTE = 30;
export const RETRY_DELAY_MS = 30 * 60 * 1000;

export type MenuSource = "live" | "fallback" | "holiday" | "no_info";

export type StoredMenuLike = {
  source: MenuSource;
  dishes: Array<{ name: string }>;
  fetchedAt: number;
} | null;

export function sameDishNames(
  storedNames: string[],
  parsedNames: string[],
): boolean {
  return (
    storedNames.length === parsedNames.length &&
    storedNames.every((name, i) => name === parsedNames[i])
  );
}

export function kstMinutesSinceMidnight(hour: number, minute: number): number {
  return hour * 60 + minute;
}

export function pastCutoff(hour: number, minute: number): boolean {
  return (
    kstMinutesSinceMidnight(hour, minute) >=
    kstMinutesSinceMidnight(CUTOFF_HOUR, CUTOFF_MINUTE)
  );
}

export function beforeFetchWindow(hour: number, minute: number): boolean {
  return (
    kstMinutesSinceMidnight(hour, minute) <
    kstMinutesSinceMidnight(FETCH_START_HOUR, FETCH_START_MINUTE)
  );
}

/**
 * Delay until the next scrape in the 09:00–12:30 KST window.
 * Returns null once it is 12:30 KST or later (last attempt has run).
 */
export function nextRetryDelayMs(hour: number, minute: number): number | null {
  const now = kstMinutesSinceMidnight(hour, minute);
  const start = kstMinutesSinceMidnight(FETCH_START_HOUR, FETCH_START_MINUTE);
  const cutoff = kstMinutesSinceMidnight(CUTOFF_HOUR, CUTOFF_MINUTE);
  if (now >= cutoff) return null;
  if (now < start) return (start - now) * 60 * 1000;
  const remainingToCutoff = (cutoff - now) * 60 * 1000;
  return Math.min(RETRY_DELAY_MS, remainingToCutoff);
}

/**
 * Keep fetching until we have a live menu (dishes or a posted closed notice).
 * An empty page is "not posted yet", not a holiday. Cutoff only stops
 * scheduling the next retry after 12:30 KST.
 */
export function needsCronRetry(existing: StoredMenuLike): boolean {
  if (!existing) return true;
  if (existing.source === "fallback") return true;
  if (existing.source === "live" && existing.dishes.length > 0) return false;
  return true;
}

/**
 * Once a live menu exists, stop. Empty / no_info rows are not fresh so a
 * later button tap can still hit the cafeteria page (release time varies).
 */
export function isFreshForServing(existing: StoredMenuLike): boolean {
  if (!existing) return false;
  if (existing.source !== "live") return false;
  return existing.dishes.length > 0;
}
