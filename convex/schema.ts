import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { dishDoc } from "./dishDoc";

export default defineSchema({
  appConfig: defineTable({
    key: v.string(), // singleton: "default"
    peonyUrl: v.string(),
    azileaUrl: v.string(),
  }).index("by_key", ["key"]),

  menus: defineTable({
    date: v.string(), // YYYY-MM-DD in KST
    cafeteria: v.union(v.literal("peony"), v.literal("azilea")),
    dishes: v.array(dishDoc),
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

  // Per-chat settings (locale now; hall preference later).
  // Independent of morning `subscribers` — unsubscribe must not wipe locale.
  chatPrefs: defineTable({
    chatId: v.number(),
    locale: v.string(), // "ru" | "en" today; string so later locales fit
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_chatId", ["chatId"]),

  // Opt-in morning push. A row means subscribed; unsubscribe deletes it.
  // chatId stays in Convex only — never sent to Aptabase.
  subscribers: defineTable({
    chatId: v.number(),
    createdAt: v.number(),
    lastPushedDate: v.optional(v.string()), // YYYY-MM-DD KST; one push per day
    // Epoch ms of an in-flight morning-push claim. Cleared on complete;
    // stale claims can be reclaimed so a crashed send does not block the day.
    pushClaimedAt: v.optional(v.number()),
  }).index("by_chatId", ["chatId"]),

  // One daily channel post. Singleton key: "default".
  channelPush: defineTable({
    key: v.string(),
    lastPostedDate: v.optional(v.string()), // YYYY-MM-DD KST; one post per day
    claimedAt: v.optional(v.number()),
    // Unique per in-flight claim so a stale worker cannot complete/release a newer one.
    claimToken: v.optional(v.string()),
    // Telegram ack or ambiguous timeout: never reclaim for another send.
    sendConfirmed: v.optional(v.boolean()),
  }).index("by_key", ["key"]),
});
