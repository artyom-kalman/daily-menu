import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import { DEFAULT_LOCALE, parseLocale } from "./i18n";

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
    const parsed = parseLocale(locale);
    const now = Date.now();
    const existing = await ctx.db
      .query("chatPrefs")
      .withIndex("by_chatId", (q) => q.eq("chatId", chatId))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, { locale: parsed, updatedAt: now });
      return { created: false, locale: parsed };
    }
    await ctx.db.insert("chatPrefs", {
      chatId,
      locale: parsed,
      createdAt: now,
      updatedAt: now,
    });
    return { created: true, locale: parsed };
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
    if (existing) {
      return { created: false, locale: parseLocale(existing.locale) };
    }
    const locale = parseLocale(fallback ?? DEFAULT_LOCALE);
    const now = Date.now();
    await ctx.db.insert("chatPrefs", {
      chatId,
      locale,
      createdAt: now,
      updatedAt: now,
    });
    return { created: true, locale };
  },
});
