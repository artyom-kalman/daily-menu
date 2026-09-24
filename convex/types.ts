import { z } from "zod";
import type { Locale } from "./i18n";

export type Cafeteria = "peony" | "azilea";

export type Dish = {
  name: string;
  spiciness: number;
  /** locale → short name translation. Hangul `name` stays canonical. */
  gloss?: Record<string, string>;
  /** Legacy Russian gloss from rows written before `gloss`. */
  description?: string;
};

export type MenuDoc = {
  date: string;
  cafeteria: Cafeteria;
  dishes: Dish[];
  fetchedAt: number;
  source: "live" | "fallback" | "holiday" | "no_info";
};

export type ScrapeResult = {
  ok: boolean;
  dishCount: number;
  error?: string;
};

export const enrichedDishesSchema = z.object({
  dishes: z.array(
    z.object({
      name: z.string(),
      spiciness: z.number().int().min(0).max(5),
      gloss: z.record(z.string(), z.string()).optional(),
      description: z.string().optional(),
    }),
  ),
});

export type EnrichedDishes = z.infer<typeof enrichedDishesSchema>;

/** Prefer `gloss[locale]`. Legacy `description` is Russian-only. Never cross-fallback. */
export function dishGloss(dish: Dish, locale: Locale): string {
  const mapped = dish.gloss?.[locale];
  if (typeof mapped === "string" && mapped.trim()) return mapped.trim();
  if (
    locale === "ru" &&
    typeof dish.description === "string" &&
    dish.description.trim()
  ) {
    return dish.description.trim();
  }
  return "";
}
