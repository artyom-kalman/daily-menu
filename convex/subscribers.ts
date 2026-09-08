import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";

export const getByChatId = internalQuery({
  args: { chatId: v.number() },
  handler: async (ctx, { chatId }) => {
    return await ctx.db
      .query("subscribers")
      .withIndex("by_chatId", (q) => q.eq("chatId", chatId))
      .unique();
  },
});

export const isSubscribed = internalQuery({
  args: { chatId: v.number() },
  handler: async (ctx, { chatId }) => {
    const row = await ctx.db
      .query("subscribers")
      .withIndex("by_chatId", (q) => q.eq("chatId", chatId))
      .unique();
    return row != null;
  },
});

export const listAll = internalQuery({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("subscribers").collect();
  },
});

export const subscribe = internalMutation({
  args: { chatId: v.number() },
  handler: async (ctx, { chatId }) => {
    const existing = await ctx.db
      .query("subscribers")
      .withIndex("by_chatId", (q) => q.eq("chatId", chatId))
      .unique();
    if (existing) return { created: false };
    await ctx.db.insert("subscribers", {
      chatId,
      createdAt: Date.now(),
    });
    return { created: true };
  },
});

/** Drop the row so we do not keep a disabled leftover. */
export const unsubscribe = internalMutation({
  args: { chatId: v.number() },
  handler: async (ctx, { chatId }) => {
    const existing = await ctx.db
      .query("subscribers")
      .withIndex("by_chatId", (q) => q.eq("chatId", chatId))
      .unique();
    if (!existing) return { deleted: false };
    await ctx.db.delete(existing._id);
    return { deleted: true };
  },
});

export const markPushed = internalMutation({
  args: { chatId: v.number(), date: v.string() },
  handler: async (ctx, { chatId, date }) => {
    const existing = await ctx.db
      .query("subscribers")
      .withIndex("by_chatId", (q) => q.eq("chatId", chatId))
      .unique();
    if (!existing) return { updated: false };
    await ctx.db.patch(existing._id, { lastPushedDate: date });
    return { updated: true };
  },
});

/** Default age after which an interrupted in-flight claim may be retried. */
export const PUSH_CLAIM_STALE_AFTER_MS = 60_000;

export type PushClaimRow = {
  lastPushedDate?: string;
  pushClaimedAt?: number;
};

/**
 * Transactional claim decision. Convex OCC + this check means only one
 * action can send to a chat for `date` until the claim is completed, released,
 * or left stale longer than `staleAfterMs`.
 */
export function decideClaimPush(
  row: PushClaimRow | null | undefined,
  args: { date: string; nowMs: number; staleAfterMs?: number },
): { claimed: false } | { claimed: true; lastPushedDate: string; pushClaimedAt: number } {
  const staleAfterMs = args.staleAfterMs ?? PUSH_CLAIM_STALE_AFTER_MS;
  if (row == null) return { claimed: false };
  if (row.lastPushedDate === args.date) {
    if (row.pushClaimedAt == null) return { claimed: false };
    if (args.nowMs - row.pushClaimedAt < staleAfterMs) return { claimed: false };
  }
  return {
    claimed: true,
    lastPushedDate: args.date,
    pushClaimedAt: args.nowMs,
  };
}

/** Atomically claim today's delivery. Concurrent callers see in-flight / done. */
export const claimPush = internalMutation({
  args: {
    chatId: v.number(),
    date: v.string(),
    nowMs: v.optional(v.number()),
    staleAfterMs: v.optional(v.number()),
  },
  handler: async (ctx, { chatId, date, nowMs, staleAfterMs }) => {
    const existing = await ctx.db
      .query("subscribers")
      .withIndex("by_chatId", (q) => q.eq("chatId", chatId))
      .unique();
    if (!existing) return { claimed: false };
    const decision = decideClaimPush(existing, {
      date,
      nowMs: nowMs ?? Date.now(),
      staleAfterMs: staleAfterMs ?? PUSH_CLAIM_STALE_AFTER_MS,
    });
    if (!decision.claimed) return { claimed: false };
    await ctx.db.patch(existing._id, {
      lastPushedDate: decision.lastPushedDate,
      pushClaimedAt: decision.pushClaimedAt,
    });
    return { claimed: true };
  },
});

/** Send succeeded: keep lastPushedDate, drop the in-flight marker. */
export const completePush = internalMutation({
  args: { chatId: v.number(), date: v.string() },
  handler: async (ctx, { chatId, date }) => {
    const existing = await ctx.db
      .query("subscribers")
      .withIndex("by_chatId", (q) => q.eq("chatId", chatId))
      .unique();
    if (!existing || existing.lastPushedDate !== date) return { updated: false };
    await ctx.db.patch(existing._id, { pushClaimedAt: undefined });
    return { updated: true };
  },
});

/**
 * Send failed: clear today's claim so a later retry can send.
 * Overwriting yesterday's lastPushedDate on claim is OK — only today matters.
 */
export const releasePushClaim = internalMutation({
  args: { chatId: v.number(), date: v.string() },
  handler: async (ctx, { chatId, date }) => {
    const existing = await ctx.db
      .query("subscribers")
      .withIndex("by_chatId", (q) => q.eq("chatId", chatId))
      .unique();
    if (
      !existing ||
      existing.lastPushedDate !== date ||
      existing.pushClaimedAt == null
    ) {
      return { updated: false };
    }
    await ctx.db.patch(existing._id, {
      lastPushedDate: undefined,
      pushClaimedAt: undefined,
    });
    return { updated: true };
  },
});
