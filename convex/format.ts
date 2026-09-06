import type { Dish } from "./types";
import { looksLikeCafeteriaNotice } from "./notices";

export const NO_MENU_INFO = "Нет информации";

/** Soft cap so leftover review copy cannot blow up a line. */
export const DESCRIPTION_MAX_CHARS = 56;

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
 * First sentence, then a word-boundary cap. Already-stored long
 * OpenRouter copy becomes scannable without a refetch.
 */
export function shortenDescription(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";

  const sentenceMatch = trimmed.match(/^[^.!?…]+/);
  let sentence = (sentenceMatch?.[0] ?? trimmed)
    .replace(/[.!?…]+$/u, "")
    .trim();

  // Many stored blurbs are "clause — marketing rest". Keep the clause.
  const dash = sentence.indexOf(" — ");
  if (dash >= 12) {
    sentence = sentence.slice(0, dash).trim();
  }

  if (sentence.length <= DESCRIPTION_MAX_CHARS) return sentence;

  const slice = sentence.slice(0, DESCRIPTION_MAX_CHARS);
  const breakAt = slice.lastIndexOf(" ");
  const cut = breakAt >= 20 ? slice.slice(0, breakAt) : slice;
  return cut.replace(/[,;:–—\-\s]+$/u, "") + "…";
}

/** Chili marks for 1–5. 0 is omitted. */
export function formatSpiciness(n: number): string {
  const level = Math.max(0, Math.min(5, Math.round(n)));
  if (level === 0) return "";
  return " " + "🌶".repeat(level);
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
  const desc = shortenDescription(dish.description);
  return desc ? `${dish.name}${spice} — ${desc}` : `${dish.name}${spice}`;
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
