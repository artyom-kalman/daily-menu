import { looksLikeCafeteriaNotice } from "./notices";
import {
  MIN_READY_DISH_COUNT,
  type StoredMenuLike,
} from "./refreshPolicy";
import { isKstWeekend } from "./dates";

/**
 * A weekday morning push needs a complete live tray, not a stub and not a
 * closed/holiday notice. Fallback / no_info never count.
 */
export function isPushableFoodMenu(existing: StoredMenuLike): boolean {
  if (!existing || existing.source !== "live") return false;
  const names = existing.dishes.map((d) => d.name);
  if (names.length === 0) return false;
  if (looksLikeCafeteriaNotice(names)) return false;
  return names.length >= MIN_READY_DISH_COUNT;
}

/**
 * Fan out after cron scrape when at least one cafeteria has a real tray.
 * Skip weekends. Skip when both sides are empty / closed / notice / stub.
 * Per-chat lastPushedDate is applied later so retries do not resend.
 */
export function shouldSendMorningPush(args: {
  today: string;
  peony: StoredMenuLike;
  azilea: StoredMenuLike;
}): boolean {
  if (isKstWeekend(args.today)) return false;
  return isPushableFoodMenu(args.peony) || isPushableFoodMenu(args.azilea);
}
