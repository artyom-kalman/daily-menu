import * as cheerio from "cheerio";

const FETCH_TIMEOUT_MS = 30_000;
const MAX_BYTES = 10 * 1024 * 1024;

export async function fetchHtml(url: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; daily-menu-bot/1.0; +https://convex.dev)",
      },
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} from ${url}`);
    }
    const buf = await res.arrayBuffer();
    if (buf.byteLength > MAX_BYTES) {
      throw new Error(`Response too large: ${buf.byteLength} bytes`);
    }
    return new TextDecoder("utf-8").decode(buf);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Returns the 0-indexed `ul.foodList` to use for the given KST weekday.
 * Mon..Fri (1..5) → that day's index (0..4).
 * Sat (6) and Sun (0) → Friday (4), matching the existing Go behavior.
 */
export function targetWeekdayIndex(weekday: number): number {
  if (weekday >= 1 && weekday <= 5) return weekday - 1;
  return 4; // Friday
}

export function parseMenuHtml(html: string, weekday: number): string[] {
  const $ = cheerio.load(html);
  const lists = $("ul.foodList");
  if (lists.length === 0) return [];
  const idx = targetWeekdayIndex(weekday);
  const list = lists.eq(idx);
  if (list.length === 0) return [];
  const dishes: string[] = [];
  list.find(".foodItem").each((_, el) => {
    const text = $(el).text().trim();
    if (text) dishes.push(text);
  });
  return dishes;
}
