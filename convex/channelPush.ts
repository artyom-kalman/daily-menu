import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import {
  PUSH_CLAIM_STALE_AFTER_MS,
  decideClaimPush,
} from "./subscribers";

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
    if (!existing) return { claimed: false };
    const decision = decideClaimPush(
      {
        lastPushedDate: existing.lastPostedDate,
        pushClaimedAt: existing.claimedAt,
      },
      {
        date,
        nowMs: nowMs ?? Date.now(),
        staleAfterMs: staleAfterMs ?? PUSH_CLAIM_STALE_AFTER_MS,
      },
    );
    if (!decision.claimed) return { claimed: false };
    await ctx.db.patch(existing._id, {
      lastPostedDate: decision.lastPushedDate,
      claimedAt: decision.pushClaimedAt,
    });
    return { claimed: true };
  },
});

/** Send succeeded: keep lastPostedDate, drop the in-flight marker. */
export const complete = internalMutation({
  args: { date: v.string() },
  handler: async (ctx, { date }) => {
    const existing = await ctx.db
      .query("channelPush")
      .withIndex("by_key", (q) => q.eq("key", CHANNEL_PUSH_KEY))
      .unique();
    if (!existing || existing.lastPostedDate !== date) return { updated: false };
    await ctx.db.patch(existing._id, { claimedAt: undefined });
    return { updated: true };
  },
});

/** Send failed: clear today's claim so a later retry can post. */
export const release = internalMutation({
  args: { date: v.string() },
  handler: async (ctx, { date }) => {
    const existing = await ctx.db
      .query("channelPush")
      .withIndex("by_key", (q) => q.eq("key", CHANNEL_PUSH_KEY))
      .unique();
    if (
      !existing ||
      existing.lastPostedDate !== date ||
      existing.claimedAt == null
    ) {
      return { updated: false };
    }
    await ctx.db.patch(existing._id, {
      lastPostedDate: undefined,
      claimedAt: undefined,
    });
    return { updated: true };
  },
});
