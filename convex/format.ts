import type { Dish } from "./types";
import { looksLikeCafeteriaNotice } from "./notices";

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
 */
export function inferCourse(name: string): Course {
  const n = name.replace(/\s/g, "");
  if (/(요구르트|요거트|후식)$/.test(n)) return "side";
  if (/(김치|깍두기)$/.test(n)) return "side";
  if (/^(쌀밥|추가밥|공기밥|흰밥|밥)$/.test(n)) return "side";
  if (/(생채|냉채|나물|무침)$/.test(n)) return "salad";
  if (/(찌개|탕)$/.test(n) || /국$/.test(n)) return "soup";
  return "hot";
}

function formatMainLine(dish: Dish): string {
  const spice = formatSpiciness(dish.spiciness);
  const desc = dish.description.trim();
  if (desc) return `${dish.name} — ${desc}${spice}`;
  return `${dish.name}${spice}`;
}

function formatSideItem(dish: Dish): string {
  return `${dish.name}${formatSpiciness(dish.spiciness)}`;
}

function formatBlock(menu: MenuLike): string {
  if (!menu || menu.dishes.length === 0) {
    return NO_MENU_INFO;
  }
  const names = menu.dishes.map((d) => d.name);
  if (looksLikeCafeteriaNotice(names)) {
    return names.join("\n");
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
    parts.push(COURSE_HEADING[course]);
    if (course === "side") {
      parts.push(dishes.map(formatSideItem).join(" · "));
    } else {
      for (const dish of dishes) {
        parts.push(formatMainLine(dish));
      }
    }
  }
  return parts.join("\n");
}

export function formatMenuMessage(peony: MenuLike, azilea: MenuLike): string {
  return (
    "🍽️ Сегодня\n\n" +
    "🌸 Peony · верхняя\n" +
    formatBlock(peony) +
    "\n\n" +
    "🌺 Azilea · нижняя\n" +
    formatBlock(azilea)
  );
}
