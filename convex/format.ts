import {
  formatKstClock,
  kstHourMinuteFromMs,
  kstYmdFromMs,
  todayKst,
} from "./dates";
import {
  DEFAULT_LOCALE,
  t,
  type Locale,
} from "./i18n";
import { looksLikeCafeteriaNotice } from "./notices";
import {
  MIN_READY_DISH_COUNT,
  pastCutoff,
  type MenuSource,
} from "./refreshPolicy";
import { dishGloss, type Dish } from "./types";

export const NO_MENU_INFO = t("ru").noMenuInfo;
export const STILL_UPDATING = t("ru").stillUpdating;

export type Course = "hot" | "soup" | "salad" | "side";

const COURSE_ORDER: Course[] = ["hot", "soup", "salad", "side"];

function courseHeading(course: Course, locale: Locale): string {
  const copy = t(locale);
  switch (course) {
    case "hot":
      return copy.courseHot;
    case "soup":
      return copy.courseSoup;
    case "salad":
      return copy.courseSalad;
    case "side":
      return copy.courseSide;
  }
}

export type FormatMenuLike = {
  dishes: Dish[];
  source?: MenuSource;
  fetchedAt?: number;
  date?: string;
} | null;

export type FormatMenuOptions = {
  /** KST calendar YYYY-MM-DD. Defaults to the menu row, then today. */
  date?: string;
  /** Epoch ms used for the 12:30 KST stub cutoff and a missing date. */
  nowMs?: number;
  locale?: Locale;
};

/** Escape dish names for Telegram `parse_mode: HTML`. */
export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function bold(s: string): string {
  return `<b>${escapeHtml(s)}</b>`;
}

function italic(s: string): string {
  return `<i>${escapeHtml(s)}</i>`;
}

/**
 * Compact chili for 1–5 (` 🌶3`). 0 is omitted.
 * One pepper + a digit keeps the same visual weight at every level,
 * so repeated 🌶🌶🌶🌶 doesn't split Hangul from Russian.
 */
export function formatSpiciness(n: number): string {
  const level = Math.max(0, Math.min(5, Math.round(n)));
  if (level === 0) return "";
  return ` 🌶${level}`;
}

/**
 * Tray slot from the Hangul name. No schema field.
 * 국수 is a main (hot), not soup. 비빔밥 is a main, not a rice side.
 * 단무지 / 요플레 are tray staples, not mains.
 */
export function inferCourse(name: string): Course {
  const n = name.replace(/\s/g, "");
  if (/(요구르트|요거트|요플레|후식)$/.test(n)) return "side";
  if (/(김치|깍두기|단무지|피클)$/.test(n)) return "side";
  if (/^(쌀밥|추가밥|공기밥|흰밥|밥)$/.test(n)) return "side";
  if (/(생채|냉채|나물|무침)$/.test(n)) return "salad";
  if (/(찌개|탕)$/.test(n) || /국$/.test(n)) return "soup";
  return "hot";
}

function formatMainLine(dish: Dish, locale: Locale): string {
  const spice = formatSpiciness(dish.spiciness);
  const name = bold(dish.name);
  const desc = dishGloss(dish, locale);
  if (desc) return `${name} — ${italic(desc)}${spice}`;
  return `${name}${spice}`;
}

function formatSideItem(dish: Dish): string {
  return `${bold(dish.name)}${formatSpiciness(dish.spiciness)}`;
}

function formatBlock(menu: FormatMenuLike, locale: Locale): string {
  if (!menu || menu.dishes.length === 0) {
    return italic(t(locale).noMenuInfo);
  }
  const names = menu.dishes.map((d) => d.name);
  if (looksLikeCafeteriaNotice(names)) {
    return names.map(escapeHtml).join("\n");
  }

  const groups: Record<Course, Dish[]> = {
    hot: [],
    soup: [],
    salad: [],
    side: [],
  };
  for (const dish of menu.dishes) {
    groups[inferCourse(dish.name)].push(dish);
  }

  const parts: string[] = [];
  for (const course of COURSE_ORDER) {
    const dishes = groups[course];
    if (dishes.length === 0) continue;
    parts.push(italic(courseHeading(course, locale)));
    if (course === "side") {
      parts.push(dishes.map(formatSideItem).join(" · "));
    } else {
      for (const dish of dishes) {
        parts.push(formatMainLine(dish, locale));
      }
    }
  }
  return parts.join("\n");
}

/** `9 сен` or `9 сен · 09:14` from a KST calendar date and optional fetch instant. */
export function formatMenuDateLine(
  ymd: string,
  fetchedAt?: number | null,
  locale: Locale = DEFAULT_LOCALE,
): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!match) {
    throw new Error(`Invalid YYYY-MM-DD: ${ymd}`);
  }
  const day = Number(match[3]);
  const monthName = t(locale).months[Number(match[2]) - 1];
  if (!monthName) {
    throw new Error(`Invalid YYYY-MM-DD: ${ymd}`);
  }
  const datePart = `${day} ${monthName}`;
  if (fetchedAt == null || fetchedAt <= 0) return datePart;
  return `${datePart} · ${formatKstClock(fetchedAt)}`;
}

function menuCalendarDate(
  peony: FormatMenuLike,
  azilea: FormatMenuLike,
  options: FormatMenuOptions | undefined,
): string {
  if (options?.date) return options.date;
  if (peony?.date) return peony.date;
  if (azilea?.date) return azilea.date;
  if (options?.nowMs != null) return kstYmdFromMs(options.nowMs);
  return todayKst();
}

function latestFetchedAt(
  peony: FormatMenuLike,
  azilea: FormatMenuLike,
): number | null {
  const times = [peony?.fetchedAt, azilea?.fetchedAt].filter(
    (ms): ms is number => typeof ms === "number" && ms > 0,
  );
  if (times.length === 0) return null;
  return Math.max(...times);
}

/**
 * Live food list that is on the page but not a full tray yet.
 * Closed notices, empty/`no_info`, and anything at/after 12:30 KST stay quiet.
 */
export function isUpdatingStub(
  menu: FormatMenuLike,
  nowMs: number = Date.now(),
): boolean {
  const { hour, minute } = kstHourMinuteFromMs(nowMs);
  if (pastCutoff(hour, minute)) return false;
  if (!menu || menu.source !== "live") return false;
  if (menu.dishes.length === 0) return false;
  const names = menu.dishes.map((d) => d.name);
  if (looksLikeCafeteriaNotice(names)) return false;
  return names.length < MIN_READY_DISH_COUNT;
}

function formatHall(
  heading: string,
  menu: FormatMenuLike,
  nowMs: number,
  locale: Locale,
): string {
  const parts = [`${bold(heading)}`, formatBlock(menu, locale)];
  if (isUpdatingStub(menu, nowMs)) {
    parts.push(italic(t(locale).stillUpdating));
  }
  return parts.join("\n");
}

export function formatMenuMessage(
  peony: FormatMenuLike,
  azilea: FormatMenuLike,
  options?: FormatMenuOptions,
): string {
  const nowMs = options?.nowMs ?? Date.now();
  const locale = options?.locale ?? DEFAULT_LOCALE;
  const copy = t(locale);
  const date = menuCalendarDate(peony, azilea, options);
  const header = formatMenuDateLine(date, latestFetchedAt(peony, azilea), locale);
  return (
    `${escapeHtml(header)}\n\n` +
    formatHall(copy.hallPeony, peony, nowMs, locale) +
    "\n\n" +
    formatHall(copy.hallAzilea, azilea, nowMs, locale)
  );
}
