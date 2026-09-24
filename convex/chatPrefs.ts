import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import { ensureLocaleWrite, setLocaleWrite } from "./chatPrefsPolicy";

export const getByChatId = internalQuery({
  args: { chatId: v.number() },
  handler: async (ctx, { chatId }) => {
    return await ctx.db
      .query("chatPrefs")
      .withIndex("by_chatId", (q) => q.eq("chatId", chatId))
      .unique();
  },
});

export const setLocale = internalMutation({
  args: { chatId: v.number(), locale: v.string() },
  handler: async (ctx, { chatId, locale }) => {
    const existing = await ctx.db
      .query("chatPrefs")
      .withIndex("by_chatId", (q) => q.eq("chatId", chatId))
      .unique();
    const write = setLocaleWrite(existing, locale, Date.now());
    if (!write.created) {
      if (!existing) {
        throw new Error("setLocaleWrite patch without chatPrefs row");
      }
      await ctx.db.patch(existing._id, write.patch);
      return { created: false, locale: write.locale };
    }
    await ctx.db.insert("chatPrefs", { chatId, ...write.insert });
    return { created: true, locale: write.locale };
  },
});

/**
 * Morning push and other paths that must send without a picker.
 * Missing row → insert Russian (existing subscribers keep today's copy).
 */
export const ensureLocale = internalMutation({
  args: {
    chatId: v.number(),
    fallback: v.optional(v.string()),
  },
  handler: async (ctx, { chatId, fallback }) => {
    const existing = await ctx.db
      .query("chatPrefs")
      .withIndex("by_chatId", (q) => q.eq("chatId", chatId))
      .unique();
    const write = ensureLocaleWrite(existing, fallback, Date.now());
    if (write.created) {
      await ctx.db.insert("chatPrefs", { chatId, ...write.insert });
    }
    return { created: write.created, locale: write.locale };
  },
});
