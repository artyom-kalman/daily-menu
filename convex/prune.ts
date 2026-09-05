import { internalAction, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { todayKst } from "./dates";
import {
  PRUNE_MAX_BATCHES,
  PRUNE_PAGE_SIZE,
  retentionCutoffDate,
  shouldPruneDate,
} from "./prunePolicy";

/**
 * Delete one page of menus and fetchAttempts older than the retention window.
 * Today's rows are skipped even if they somehow match the cutoff.
 */
export const pruneOldRows = internalMutation({
  args: {},
  handler: async (ctx) => {
    const today = todayKst();
    const cutoff = retentionCutoffDate(today);
    const pageSize = PRUNE_PAGE_SIZE;
    let menusDeleted = 0;
    let attemptsDeleted = 0;

    const menus = await ctx.db
      .query("menus")
      .withIndex("by_date", (q) => q.lt("date", cutoff))
      .take(pageSize);
    for (const row of menus) {
      if (!shouldPruneDate(row.date, today)) continue;
      await ctx.db.delete(row._id);
      menusDeleted += 1;
    }

    const attempts = await ctx.db
      .query("fetchAttempts")
      .withIndex("by_date", (q) => q.lt("date", cutoff))
      .take(pageSize);
    for (const row of attempts) {
      if (!shouldPruneDate(row.date, today)) continue;
      await ctx.db.delete(row._id);
      attemptsDeleted += 1;
    }

    return {
      today,
      cutoff,
      menusDeleted,
      attemptsDeleted,
      more: menus.length === pageSize || attempts.length === pageSize,
    };
  },
});

/** Cron entrypoint: drain old rows in batches. */
export const pruneOldData = internalAction({
  args: {},
  handler: async (ctx) => {
    let menusDeleted = 0;
    let attemptsDeleted = 0;
    let today = "";
    let cutoff = "";

    for (let i = 0; i < PRUNE_MAX_BATCHES; i++) {
      const batch = await ctx.runMutation(internal.prune.pruneOldRows, {});
      today = batch.today;
      cutoff = batch.cutoff;
      menusDeleted += batch.menusDeleted;
      attemptsDeleted += batch.attemptsDeleted;
      if (!batch.more) break;
    }

    console.log(
      `pruneOldData: today=${today} cutoff=${cutoff} menusDeleted=${menusDeleted} attemptsDeleted=${attemptsDeleted}`,
    );
    return { today, cutoff, menusDeleted, attemptsDeleted };
  },
});
