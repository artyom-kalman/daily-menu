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

/**
 * Fan out after cron scrape when both cafeterias are settled and at least
 * one has a real tray. Skip weekends. Skip while either side is still a stub.
 * A closed/holiday notice is final (not a stub), so one open tray + one
 * closed hall can still push. Both-closed / no_info days are skipped.
 * Per-chat lastPushedDate is applied later so retries do not resend.
 */
export function shouldSendMorningPush(args: {
  today: string;
  peony: StoredMenuLike;
  azilea: StoredMenuLike;
}): boolean {
  if (isKstWeekend(args.today)) return false;
  if (!isCompleteLiveMenu(args.peony) || !isCompleteLiveMenu(args.azilea)) {
    return false;
  }
  return isPushableFoodMenu(args.peony) || isPushableFoodMenu(args.azilea);
}
