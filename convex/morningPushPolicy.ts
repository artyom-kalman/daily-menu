import { looksLikeCafeteriaNotice } from "./notices";
import {
  MIN_READY_DISH_COUNT,
  isCompleteLiveMenu,
  type StoredMenuLike,
} from "./refreshPolicy";
import { isKstWeekend } from "./dates";

/**
 * A weekday morning push needs a complete live tray, not a stub and not a
 * closed/holiday notice. Fallback / no_info never count.
 * The 5-dish bar is per cafeteria, never summed across halls.
 */
export function isPushableFoodMenu(existing: StoredMenuLike): boolean {
  if (!existing || existing.source !== "live") return false;
  const names = existing.dishes.map((d) => d.name);
  if (names.length === 0) return false;
  if (looksLikeCafeteriaNotice(names)) return false;
  return names.length >= MIN_READY_DISH_COUNT;
}

/** Any stored line we can show: complete tray, stub, or closed notice. */
export function hasPostedMenu(existing: StoredMenuLike): boolean {
  return !!existing && existing.dishes.length > 0;
}

/**
 * Fan out after cron scrape when both cafeterias are settled and at least
 * one has a real tray. Skip weekends. Skip while either side is still a stub
 * — until the last 12:30 KST attempt, which sends whatever is posted even if
 * one hall is empty (`Нет информации`). A closed/holiday notice is final (not
 * a stub), so one open tray + one closed hall can still push earlier.
 * Both-empty / weekend days are skipped. Per-chat lastPushedDate is applied
 * later so retries do not resend.
 */
export function shouldSendMorningPush(args: {
  today: string;
  peony: StoredMenuLike;
  azilea: StoredMenuLike;
  /** True at 12:30 KST cutoff (no further cron retry). */
  lastAttempt?: boolean;
}): boolean {
  if (isKstWeekend(args.today)) return false;
  if (args.lastAttempt) {
    return hasPostedMenu(args.peony) || hasPostedMenu(args.azilea);
  }
  if (!isCompleteLiveMenu(args.peony) || !isCompleteLiveMenu(args.azilea)) {
    return false;
  }
  return isPushableFoodMenu(args.peony) || isPushableFoodMenu(args.azilea);
}
