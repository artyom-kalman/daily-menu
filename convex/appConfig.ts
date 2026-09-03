import { v } from "convex/values";
import { internalQuery, mutation, query } from "./_generated/server";

export const APP_CONFIG_KEY = "default";

export const get = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("appConfig")
      .withIndex("by_key", (q) => q.eq("key", APP_CONFIG_KEY))
      .unique();
  },
});

export const getInternal = internalQuery({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("appConfig")
      .withIndex("by_key", (q) => q.eq("key", APP_CONFIG_KEY))
      .unique();
  },
});

/** Upsert the singleton app config (cafeteria scrape URLs). */
export const upsert = mutation({
  args: {
    peonyUrl: v.string(),
    azileaUrl: v.string(),
  },
  handler: async (ctx, { peonyUrl, azileaUrl }) => {
    const existing = await ctx.db
      .query("appConfig")
      .withIndex("by_key", (q) => q.eq("key", APP_CONFIG_KEY))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, { peonyUrl, azileaUrl });
      return existing._id;
    }
    return await ctx.db.insert("appConfig", {
      key: APP_CONFIG_KEY,
      peonyUrl,
      azileaUrl,
    });
  },
});
