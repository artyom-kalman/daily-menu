import { looksLikeCafeteriaNotice } from "./notices";

export const FETCH_START_HOUR = 9;
export const FETCH_START_MINUTE = 0;
export const CUTOFF_HOUR = 12;
export const CUTOFF_MINUTE = 30;
export const RETRY_DELAY_MS = 30 * 60 * 1000;

/** Typical tray is 6–8 items. Fewer than 5 is still a stub (오므라이스, or 잔치국수+추가밥). */
export const MIN_READY_DISH_COUNT = 5;

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
 * Morning push delivery window: 09:00 through 12:30 KST inclusive.
 * 12:30 is included because the last fetch attempt runs at cutoff.
 */
export function inMorningPushWindow(hour: number, minute: number): boolean {
  const now = kstMinutesSinceMidnight(hour, minute);
  const start = kstMinutesSinceMidnight(FETCH_START_HOUR, FETCH_START_MINUTE);
  const cutoff = kstMinutesSinceMidnight(CUTOFF_HOUR, CUTOFF_MINUTE);
  return now >= start && now <= cutoff;
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
 * A posted closed notice is final even as one line. A short food list is not —
 * KBU often stubs a main first and fills the tray later.
 */
export function isCompleteLiveMenu(existing: StoredMenuLike): boolean {
  if (!existing || existing.source !== "live") return false;
  const names = existing.dishes.map((d) => d.name);
  if (names.length === 0) return false;
  if (looksLikeCafeteriaNotice(names)) return true;
  return names.length >= MIN_READY_DISH_COUNT;
}

/**
 * Keep fetching until we have a complete live menu (tray or closed notice).
 * An empty page is "not posted yet", not a holiday. Cutoff only stops
 * scheduling the next retry after 12:30 KST.
 */
export function needsCronRetry(existing: StoredMenuLike): boolean {
  if (!existing) return true;
  if (existing.source === "fallback") return true;
  return !isCompleteLiveMenu(existing);
}

/**
 * Once a complete live menu exists, stop. Empty / stub / no_info rows are
 * not fresh so a later button tap can still hit the cafeteria page.
 */
export function isFreshForServing(existing: StoredMenuLike): boolean {
  return isCompleteLiveMenu(existing);
}
