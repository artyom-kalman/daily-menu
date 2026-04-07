import { z } from "zod";

export type Cafeteria = "peony" | "azilea";

export type Dish = {
  name: string;
  description: string;
  spiciness: number;
};

export type MenuDoc = {
  date: string;
  cafeteria: Cafeteria;
  dishes: Dish[];
  fetchedAt: number;
  source: "live" | "fallback" | "holiday";
};

export const enrichedDishesSchema = z.object({
  dishes: z.array(
    z.object({
      name: z.string(),
      description: z.string(),
      spiciness: z.number().int().min(0).max(5),
    }),
  ),
});

export type EnrichedDishes = z.infer<typeof enrichedDishesSchema>;
