import type { Dish } from "./types";
import { looksLikeCafeteriaNotice } from "./notices";
import { formatPorkMark, PORK_LEGEND, PORK_SWAP_HINT } from "./pork";

export const NO_MENU_INFO = "Нет информации";

export type Course = "hot" | "soup" | "salad" | "side";

const COURSE_ORDER: Course[] = ["hot", "soup", "salad", "side"];

const COURSE_HEADING: Record<Course, string> = {
  hot: "Горячее",
  soup: "Суп",
  salad: "Салат",
  side: "Ещё",
};

type MenuLike = { dishes: Dish[] } | null;

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

export type FormatMenuOptions = {
  /** Opt-in pork marks on the same lines. Default menu stays unmarked. */
  markPork?: boolean;
};

function porkSuffix(name: string, markPork: boolean): string {
  return markPork ? formatPorkMark(name) : "";
}

function formatMainLine(dish: Dish, markPork: boolean): string {
  const spice = formatSpiciness(dish.spiciness);
  const pork = porkSuffix(dish.name, markPork);
  const name = bold(dish.name);
  const desc = dish.description.trim();
  if (desc) return `${name} — ${italic(desc)}${spice}${pork}`;
  return `${name}${spice}${pork}`;
}

function formatSideItem(dish: Dish, markPork: boolean): string {
  return `${bold(dish.name)}${formatSpiciness(dish.spiciness)}${porkSuffix(dish.name, markPork)}`;
}

function formatBlock(menu: MenuLike, markPork: boolean): string {
  if (!menu || menu.dishes.length === 0) {
    return italic(NO_MENU_INFO);
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
    parts.push(italic(COURSE_HEADING[course]));
    if (course === "side") {
      parts.push(dishes.map((d) => formatSideItem(d, markPork)).join(" · "));
    } else {
      for (const dish of dishes) {
        parts.push(formatMainLine(dish, markPork));
      }
    }
  }
  return parts.join("\n");
}

export function formatMenuMessage(
  peony: MenuLike,
  azilea: MenuLike,
  options: FormatMenuOptions = {},
): string {
  const markPork = options.markPork === true;
  const body =
    `${bold("🌸 Peony · верхняя")}\n` +
    formatBlock(peony, markPork) +
    "\n\n" +
    `${bold("🌺 Azilea · нижняя")}\n` +
    formatBlock(azilea, markPork);
  if (!markPork) return body;
  return body + "\n\n" + italic(PORK_LEGEND) + "\n" + italic(PORK_SWAP_HINT);
}
