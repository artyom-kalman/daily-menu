import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import { PUSH_CLAIM_STALE_AFTER_MS } from "./subscribers";
import {
  decideClaimChannelPush,
  newChannelClaimToken,
  ownsChannelClaim,
} from "./channelPushPolicy";

export const CHANNEL_PUSH_KEY = "default";

export const get = internalQuery({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("channelPush")
      .withIndex("by_key", (q) => q.eq("key", CHANNEL_PUSH_KEY))
      .unique();
  },
});

/** Atomically claim today's channel post. Concurrent callers see in-flight / done. */
export const claim = internalMutation({
  args: {
    date: v.string(),
    nowMs: v.optional(v.number()),
    staleAfterMs: v.optional(v.number()),
  },
  handler: async (ctx, { date, nowMs, staleAfterMs }) => {
    let existing = await ctx.db
      .query("channelPush")
      .withIndex("by_key", (q) => q.eq("key", CHANNEL_PUSH_KEY))
      .unique();
    if (!existing) {
      const id = await ctx.db.insert("channelPush", { key: CHANNEL_PUSH_KEY });
      existing = await ctx.db.get(id);
    }
    if (!existing) return { claimed: false as const };
    const decision = decideClaimChannelPush(existing, {
      date,
      nowMs: nowMs ?? Date.now(),
      staleAfterMs: staleAfterMs ?? PUSH_CLAIM_STALE_AFTER_MS,
    });
    if (!decision.claimed) return { claimed: false as const };
    if (decision.resumeComplete) {
      return {
        claimed: true as const,
        claimToken: decision.claimToken,
        resumeComplete: true as const,
      };
    }
    const claimToken = newChannelClaimToken();
    await ctx.db.patch(existing._id, {
      lastPostedDate: decision.lastPostedDate,
      claimedAt: decision.claimedAt,
      claimToken,
      sendConfirmed: undefined,
    });
    return { claimed: true as const, claimToken, resumeComplete: false as const };
  },
});

/** Telegram ack or ambiguous timeout: do not reclaim this date for another send. */
export const confirm = internalMutation({
  args: { date: v.string(), claimToken: v.string() },
  handler: async (ctx, { date, claimToken }) => {
    const existing = await ctx.db
      .query("channelPush")
      .withIndex("by_key", (q) => q.eq("key", CHANNEL_PUSH_KEY))
      .unique();
    if (!ownsChannelClaim(existing, { date, claimToken })) {
      return { updated: false };
    }
    await ctx.db.patch(existing._id, { sendConfirmed: true });
    return { updated: true };
  },
});

/** Send succeeded: keep lastPostedDate, drop the in-flight marker. */
export const complete = internalMutation({
  args: { date: v.string(), claimToken: v.string() },
  handler: async (ctx, { date, claimToken }) => {
    const existing = await ctx.db
      .query("channelPush")
      .withIndex("by_key", (q) => q.eq("key", CHANNEL_PUSH_KEY))
      .unique();
    if (!ownsChannelClaim(existing, { date, claimToken })) {
      return { updated: false };
    }
    await ctx.db.patch(existing._id, {
      claimedAt: undefined,
      claimToken: undefined,
      sendConfirmed: true,
    });
    return { updated: true };
  },
});

/** Send failed: clear today's claim so a later retry can post. */
export const release = internalMutation({
  args: { date: v.string(), claimToken: v.string() },
  handler: async (ctx, { date, claimToken }) => {
    const existing = await ctx.db
      .query("channelPush")
      .withIndex("by_key", (q) => q.eq("key", CHANNEL_PUSH_KEY))
      .unique();
    if (!ownsChannelClaim(existing, { date, claimToken })) {
      return { updated: false };
    }
    if (existing.claimedAt == null || existing.sendConfirmed) {
      return { updated: false };
    }
    await ctx.db.patch(existing._id, {
      lastPostedDate: undefined,
      claimedAt: undefined,
      claimToken: undefined,
      sendConfirmed: undefined,
    });
    return { updated: true };
  },
});
