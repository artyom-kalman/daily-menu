import type { Cafeteria, ScrapeResult } from "./types";

const CAFETERIAS: Cafeteria[] = ["peony", "azilea"];

/**
 * Run a scrape for each cafeteria. A thrown scrape does not skip the rest.
 */
export async function scrapeCafeteriasSafely(
  scrape: (cafeteria: Cafeteria) => Promise<ScrapeResult>,
): Promise<Record<Cafeteria, ScrapeResult>> {
  const results: Record<Cafeteria, ScrapeResult> = {
    peony: { ok: false, dishCount: 0 },
    azilea: { ok: false, dishCount: 0 },
  };
  for (const cafeteria of CAFETERIAS) {
    try {
      results[cafeteria] = await scrape(cafeteria);
    } catch (err) {
      results[cafeteria] = {
        ok: false,
        dishCount: 0,
        error: (err as Error).message,
      };
    }
  }
  return results;
}
