import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  appConfig: defineTable({
    key: v.string(), // singleton: "default"
    peonyUrl: v.string(),
    azileaUrl: v.string(),
  }).index("by_key", ["key"]),

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
      v.literal("no_info"),
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

  // Dedup Telegram webhook retries for expensive admin commands (/refetch).
  telegramUpdates: defineTable({
    updateId: v.number(),
    claimedAt: v.number(),
  }).index("by_updateId", ["updateId"]),
});
