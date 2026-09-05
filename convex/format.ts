import type { Dish } from "./types";
import { looksLikeCafeteriaNotice } from "./notices";

export const NO_MENU_INFO = "Нет информации";

/** Soft cap so a phone screen shows names, not blurbs. */
export const DESCRIPTION_MAX_CHARS = 56;

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

function formatDishLine(dish: Dish): string {
  const spice = formatSpiciness(dish.spiciness);
  const desc = shortenDescription(dish.description);
  return desc ? `${dish.name}${spice} — ${desc}` : `${dish.name}${spice}`;
}

function formatBlock(menu: MenuLike): string {
  if (!menu || menu.dishes.length === 0) {
    return NO_MENU_INFO;
  }
  const names = menu.dishes.map((d) => d.name);
  if (looksLikeCafeteriaNotice(names)) {
    return names.join("\n");
  }
  return menu.dishes.map(formatDishLine).join("\n");
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
