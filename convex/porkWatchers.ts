import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";

export const getByChatId = internalQuery({
  args: { chatId: v.number() },
  handler: async (ctx, { chatId }) => {
    return await ctx.db
      .query("porkWatchers")
      .withIndex("by_chatId", (q) => q.eq("chatId", chatId))
      .unique();
  },
});

export const isWatching = internalQuery({
  args: { chatId: v.number() },
  handler: async (ctx, { chatId }) => {
    const row = await ctx.db
      .query("porkWatchers")
      .withIndex("by_chatId", (q) => q.eq("chatId", chatId))
      .unique();
    return row != null;
  },
});

export const listAll = internalQuery({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("porkWatchers").collect();
  },
});

export const watch = internalMutation({
  args: { chatId: v.number() },
  handler: async (ctx, { chatId }) => {
    const existing = await ctx.db
      .query("porkWatchers")
      .withIndex("by_chatId", (q) => q.eq("chatId", chatId))
      .unique();
    if (existing) return { created: false };
    await ctx.db.insert("porkWatchers", {
      chatId,
      createdAt: Date.now(),
    });
    return { created: true };
  },
});

/** Drop the row so we do not keep a disabled leftover. */
export const unwatch = internalMutation({
  args: { chatId: v.number() },
  handler: async (ctx, { chatId }) => {
    const existing = await ctx.db
      .query("porkWatchers")
      .withIndex("by_chatId", (q) => q.eq("chatId", chatId))
      .unique();
    if (!existing) return { deleted: false };
    await ctx.db.delete(existing._id);
    return { deleted: true };
  },
});
