import { v } from "convex/values";

/** Stored dish. `gloss` is locale → translation; `description` is legacy Russian. */
export const dishDoc = v.object({
  name: v.string(),
  spiciness: v.number(),
  gloss: v.optional(v.record(v.string(), v.string())),
  description: v.optional(v.string()),
});
