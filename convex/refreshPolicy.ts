export const MENU_STALE_MS = 30 * 60 * 1000;

export type StoredMenuLike = {
  source: "live" | "fallback" | "holiday";
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

/**
 * Morning cron should keep fetching until 12:30 KST when the row is missing,
 * a fallback, or an empty "holiday" scrape. An empty page at 06:00 usually
 * means the university has not posted yet, not that the cafeteria is closed.
 * Live menus with dishes are left alone; Telegram refreshes those if stale.
 */
export function needsCronRetry(
  existing: StoredMenuLike,
  pastCutoff: boolean,
): boolean {
  if (!existing) return true;
  if (existing.source === "fallback") return true;
  if (existing.source === "holiday" || existing.dishes.length === 0) {
    return !pastCutoff;
  }
  return false;
}

/**
 * Cached live menus are served as-is only when they were confirmed recently.
 * Holiday / empty / fallback rows are never treated as fresh, so a later
 * button tap re-fetches the cafeteria page instead of repeating "выходной".
 */
export function isFreshForServing(
  existing: StoredMenuLike,
  now: number,
  staleMs = MENU_STALE_MS,
): boolean {
  if (!existing) return false;
  if (existing.source !== "live") return false;
  if (existing.dishes.length === 0) return false;
  return now - existing.fetchedAt < staleMs;
}
