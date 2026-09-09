import { escapeHtml } from "./format";
import { looksLikeCafeteriaNotice } from "./notices";
import type { Dish } from "./types";

export type PorkSignal = "certain" | "maybe";

export const PORK_NOTE_TITLE = "Свинина сегодня";
export const PORK_NONE_CERTAIN =
  "Сегодня в названиях явной свинины нет.";
export const PORK_SWAP_HINT =
  "Если блюдо не подходит — на стойке можно попросить замену.";

type MenuLike = { dishes: Dish[] } | null;

function compactName(name: string): string {
  return name.replace(/\s+/g, "");
}

/** Hangul tokens / dish types that are pork in a KBU cafeteria line. */
const CERTAIN_RE =
  /돈육|돼지|제육|돈까스|돈가스|돈카츠|돈카스|삼겹|목살|항정살|보쌈|족발|수육|동파육|탕수육|부대찌개|부대찜|부대볶음|감자탕|돈불|베이컨|베컨|소시지|소세지|비엔나|리챔|스팸|폭립|오삼|껍데기|두루치기|목전지|대패/;

/** 순대 (blood sausage), not 순두부. */
const SUNDAE_RE = /순대(?!부)/;

const HAMBURGER_RE = /햄버거/;
const HAM_RE = /햄/;

/**
 * Named other protein wins over "maybe". Checked only after certain.
 * 오삼 is certain (삼겹) before this runs.
 */
const OTHER_PROTEIN_RE =
  /닭|치킨|오리|소고기|쇠고기|우육|양고기|참치|생선|새우|오징어|낙지|주꾸미|날치|어묵|맛살|고등어|명태|갈치|연어|대구|조기|홍합|바지락|문어|타코야끼/;

const MAYBE_RE =
  /찌개|만두|라면|피자|고로케|마제|짜장|짬뽕|카레|오므라이스|핫도그|햄버거|볶음밥|짜글이|떡갈비|동그랑땡|산적/;

const BEEF_OR_CHICKEN_BULGOGI_RE = /(소|우|닭)불고기/;
const BULGOGI_RE = /불고기/;

export function porkSignal(name: string): PorkSignal | null {
  const n = compactName(name);
  if (!n) return null;

  if (CERTAIN_RE.test(n) || SUNDAE_RE.test(n)) return "certain";
  if (HAMBURGER_RE.test(n)) return "maybe";
  if (HAM_RE.test(n)) return "certain";

  if (OTHER_PROTEIN_RE.test(n)) return null;

  if (MAYBE_RE.test(n)) return "maybe";
  if (BULGOGI_RE.test(n) && !BEEF_OR_CHICKEN_BULGOGI_RE.test(n)) {
    return "maybe";
  }
  return null;
}

export type PorkHits = {
  certain: string[];
  maybe: string[];
};

export function porkHitsForDishes(dishes: Dish[]): PorkHits {
  const certain: string[] = [];
  const maybe: string[] = [];
  for (const dish of dishes) {
    const signal = porkSignal(dish.name);
    if (signal === "certain") certain.push(dish.name);
    else if (signal === "maybe") maybe.push(dish.name);
  }
  return { certain, maybe };
}

function hitsForMenu(menu: MenuLike): PorkHits {
  if (!menu || menu.dishes.length === 0) return { certain: [], maybe: [] };
  if (looksLikeCafeteriaNotice(menu.dishes.map((d) => d.name))) {
    return { certain: [], maybe: [] };
  }
  return porkHitsForDishes(menu.dishes);
}

function formatCafeLine(
  label: string,
  names: string[],
): string | null {
  if (names.length === 0) return null;
  return `${label} — ${names.map(escapeHtml).join(", ")}`;
}

function formatHitBlock(
  heading: string,
  peony: string[],
  azilea: string[],
): string[] {
  const lines = [
    formatCafeLine("🌸 Peony", peony),
    formatCafeLine("🌺 Azilea", azilea),
  ].filter((line): line is string => line != null);
  if (lines.length === 0) return [];
  return [heading, ...lines];
}

/** Opt-in follow-up. Does not change the main menu message. */
export function formatPorkNote(peony: MenuLike, azilea: MenuLike): string {
  const peonyHits = hitsForMenu(peony);
  const azileaHits = hitsForMenu(azilea);
  const parts: string[] = [PORK_NOTE_TITLE, ""];

  const certainBlock = formatHitBlock(
    "Точно:",
    peonyHits.certain,
    azileaHits.certain,
  );
  if (certainBlock.length > 0) {
    parts.push(...certainBlock);
  } else {
    parts.push(PORK_NONE_CERTAIN);
  }

  const maybeBlock = formatHitBlock(
    "Возможно:",
    peonyHits.maybe,
    azileaHits.maybe,
  );
  if (maybeBlock.length > 0) {
    parts.push("", ...maybeBlock);
  }

  parts.push("", PORK_SWAP_HINT);
  return parts.join("\n");
}
