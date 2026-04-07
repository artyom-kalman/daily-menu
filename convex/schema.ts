import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  menus: defineTable({
    date: v.string(), // YYYY-MM-DD in KST
    cafeteria: v.union(v.literal("peony"), v.literal("azilea")),
    dishes: v.array(
      v.object({
        name: v.string(),
        description: v.string(),
        spiciness: v.number(),
      }),
    ),
    fetchedAt: v.number(),
    source: v.union(
      v.literal("live"),
      v.literal("fallback"),
      v.literal("holiday"),
    ),
  })
    .index("by_date_cafeteria", ["date", "cafeteria"])
    .index("by_date", ["date"]),

  fetchAttempts: defineTable({
    date: v.string(),
    cafeteria: v.string(),
    attemptedAt: v.number(),
    status: v.union(
      v.literal("success"),
      v.literal("empty"),
      v.literal("error"),
    ),
    error: v.optional(v.string()),
  }).index("by_date", ["date"]),
});
