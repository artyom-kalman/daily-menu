import { v } from "convex/values";
import {
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { fetchHtml, parseMenuHtml } from "./scraper";
import { enrichDishes } from "./openrouter";
import { kstHourMinute, kstNow, kstWeekday, todayKst } from "./dates";
import { sendAdminAlert } from "./telegramClient";
import { looksLikeCafeteriaNotice } from "./notices";
import {
  beforeFetchWindow,
  isFreshForServing,
  needsCronRetry,
  nextRetryDelayMs,
  sameDishNames,
} from "./refreshPolicy";
import type { Cafeteria, Dish } from "./types";

const CAFETERIAS: Cafeteria[] = ["peony", "azilea"];
const MENU_SOURCE = v.union(
  v.literal("live"),
  v.literal("fallback"),
  v.literal("holiday"),
  v.literal("no_info"),
);

function bareDishes(names: string[]): Dish[] {
  return names.map((name) => ({ name, description: "", spiciness: 0 }));
}

// ---------- Queries ----------

export const getTodayBoth = query({
  args: {},
  handler: async (ctx) => {
    const date = todayKst();
    const rows = await ctx.db
      .query("menus")
      .withIndex("by_date", (q) => q.eq("date", date))
      .collect();
    const peony = rows.find((r) => r.cafeteria === "peony") ?? null;
    const azilea = rows.find((r) => r.cafeteria === "azilea") ?? null;
    return { date, peony, azilea };
  },
});

export const getMenuForDate = internalQuery({
  args: { date: v.string(), cafeteria: v.string() },
  handler: async (ctx, { date, cafeteria }) => {
    return await ctx.db
      .query("menus")
      .withIndex("by_date_cafeteria", (q) =>
        q.eq("date", date).eq("cafeteria", cafeteria as Cafeteria),
      )
      .unique();
  },
});

export const listAttemptsForDate = internalQuery({
  args: { date: v.string() },
  handler: async (ctx, { date }) => {
    return await ctx.db
      .query("fetchAttempts")
      .withIndex("by_date", (q) => q.eq("date", date))
      .collect();
  },
});

// ---------- Mutations ----------

export const upsertMenu = internalMutation({
  args: {
    date: v.string(),
    cafeteria: v.union(v.literal("peony"), v.literal("azilea")),
    dishes: v.array(
      v.object({
        name: v.string(),
        description: v.string(),
        spiciness: v.number(),
      }),
    ),
    fetchedAt: v.number(),
    source: MENU_SOURCE,
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("menus")
      .withIndex("by_date_cafeteria", (q) =>
        q.eq("date", args.date).eq("cafeteria", args.cafeteria),
      )
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, {
        dishes: args.dishes,
        fetchedAt: args.fetchedAt,
        source: args.source,
      });
      return existing._id;
    }
    return await ctx.db.insert("menus", args);
  },
});

export const recordAttempt = internalMutation({
  args: {
    date: v.string(),
    cafeteria: v.string(),
    attemptedAt: v.number(),
    status: v.union(
      v.literal("success"),
      v.literal("empty"),
      v.literal("error"),
    ),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("fetchAttempts", args);
  },
});

/** Seed today's menus for E2E / manual checks without scraping. */
export const seedToday = mutation({
  args: {
    peonyDishes: v.array(
      v.object({
        name: v.string(),
        description: v.string(),
        spiciness: v.number(),
      }),
    ),
    azileaDishes: v.array(
      v.object({
        name: v.string(),
        description: v.string(),
        spiciness: v.number(),
      }),
    ),
  },
  handler: async (ctx, { peonyDishes, azileaDishes }) => {
    const date = todayKst();
    const fetchedAt = Date.now();
    for (const [cafeteria, dishes] of [
      ["peony", peonyDishes],
      ["azilea", azileaDishes],
    ] as const) {
      const existing = await ctx.db
        .query("menus")
        .withIndex("by_date_cafeteria", (q) =>
          q.eq("date", date).eq("cafeteria", cafeteria),
        )
        .unique();
      if (existing) {
        await ctx.db.patch(existing._id, {
          dishes,
          fetchedAt,
          source: "live",
        });
      } else {
        await ctx.db.insert("menus", {
          date,
          cafeteria,
          dishes,
          fetchedAt,
          source: "live",
        });
      }
    }
    return { date };
  },
});

// ---------- Actions ----------

export const scrapeAndEnrich = internalAction({
  args: {
    cafeteria: v.union(v.literal("peony"), v.literal("azilea")),
  },
  handler: async (ctx, { cafeteria }): Promise<{ ok: boolean; dishCount: number }> => {
    const date = todayKst();
    const config = await ctx.runQuery(internal.appConfig.getInternal, {});
    const url =
      cafeteria === "peony" ? config?.peonyUrl : config?.azileaUrl;
    if (!url) {
      const err = `Missing appConfig URL for ${cafeteria}`;
      console.error(err);
      await ctx.runMutation(internal.menus.recordAttempt, {
        date,
        cafeteria,
        attemptedAt: Date.now(),
        status: "error",
        error: err,
      });
      return { ok: false, dishCount: 0 };
    }

    try {
      const html = await fetchHtml(url);
      const weekday = kstWeekday(kstNow());
      const names = parseMenuHtml(html, weekday);
      const existing = await ctx.runQuery(internal.menus.getMenuForDate, {
        date,
        cafeteria,
      });

      if (names.length === 0) {
        // Don't clobber a good live menu if a later scrape comes back empty
        // (parse blip / partial HTML). Keep retrying via cron / stale refresh.
        if (existing?.source === "live" && existing.dishes.length > 0) {
          await ctx.runMutation(internal.menus.recordAttempt, {
            date,
            cafeteria,
            attemptedAt: Date.now(),
            status: "empty",
            error: "empty parse; kept existing live menu",
          });
          return { ok: true, dishCount: existing.dishes.length };
        }
        await ctx.runMutation(internal.menus.upsertMenu, {
          date,
          cafeteria,
          dishes: [],
          fetchedAt: Date.now(),
          source: "no_info",
        });
        await ctx.runMutation(internal.menus.recordAttempt, {
          date,
          cafeteria,
          attemptedAt: Date.now(),
          status: "empty",
        });
        return { ok: true, dishCount: 0 };
      }

      if (
        existing?.source === "live" &&
        sameDishNames(
          existing.dishes.map((d) => d.name),
          names,
        )
      ) {
        await ctx.runMutation(internal.menus.upsertMenu, {
          date,
          cafeteria,
          dishes: existing.dishes,
          fetchedAt: Date.now(),
          source: "live",
        });
        await ctx.runMutation(internal.menus.recordAttempt, {
          date,
          cafeteria,
          attemptedAt: Date.now(),
          status: "success",
        });
        return { ok: true, dishCount: existing.dishes.length };
      }

      const dishes = looksLikeCafeteriaNotice(names)
        ? bareDishes(names)
        : await enrichDishes(names);
      await ctx.runMutation(internal.menus.upsertMenu, {
        date,
        cafeteria,
        dishes,
        fetchedAt: Date.now(),
        source: "live",
      });
      await ctx.runMutation(internal.menus.recordAttempt, {
        date,
        cafeteria,
        attemptedAt: Date.now(),
        status: "success",
      });
      return { ok: true, dishCount: dishes.length };
    } catch (err) {
      const message = (err as Error).message;
      console.error(`scrapeAndEnrich(${cafeteria}) failed: ${message}`);
      await ctx.runMutation(internal.menus.recordAttempt, {
        date,
        cafeteria,
        attemptedAt: Date.now(),
        status: "error",
        error: message,
      });
      return { ok: false, dishCount: 0 };
    }
  },
});

export const fetchAllForToday = internalAction({
  args: { retryCount: v.optional(v.number()) },
  handler: async (ctx, { retryCount }): Promise<void> => {
    const date = todayKst();
    const attempt = retryCount ?? 0;
    const { hour, minute } = kstHourMinute();
    console.log(
      `fetchAllForToday: date=${date} attempt=${attempt} kst=${hour}:${String(minute).padStart(2, "0")}`,
    );

    if (beforeFetchWindow(hour, minute)) {
      const delay = nextRetryDelayMs(hour, minute);
      if (delay != null) {
        console.log(`Before 09:00 KST; scheduling first fetch in ${delay / 60000} min`);
        await ctx.scheduler.runAfter(
          delay,
          internal.menus.fetchAllForToday,
          { retryCount: attempt },
        );
      }
      return;
    }

    const missing: Cafeteria[] = [];
    for (const cafeteria of CAFETERIAS) {
      const existing = await ctx.runQuery(internal.menus.getMenuForDate, {
        date,
        cafeteria,
      });
      if (needsCronRetry(existing)) {
        missing.push(cafeteria);
      }
    }

    if (missing.length === 0) {
      console.log("All menus already present for today");
      return;
    }

    let anyError = false;
    let stillEmpty = false;
    for (const cafeteria of missing) {
      const result = await ctx.runAction(internal.menus.scrapeAndEnrich, {
        cafeteria,
      });
      if (!result.ok) anyError = true;
      if (result.dishCount === 0) stillEmpty = true;
    }

    if (!anyError && !stillEmpty) return;

    const delay = nextRetryDelayMs(
      kstHourMinute().hour,
      kstHourMinute().minute,
    );
    if (delay != null) {
      console.log(
        `Some cafeterias still have no menu; scheduling retry in ${Math.round(delay / 60000)} min`,
      );
      await ctx.scheduler.runAfter(
        delay,
        internal.menus.fetchAllForToday,
        { retryCount: attempt + 1 },
      );
      return;
    }

    if (!anyError) return;

    const attempts = await ctx.runQuery(internal.menus.listAttemptsForDate, {
      date,
    });
    const summary = attempts
      .map(
        (a) =>
          `${a.cafeteria}: ${a.status}${a.error ? ` (${a.error})` : ""}`,
      )
      .join("\n");
    await sendAdminAlert(
      `⚠️ daily-menu: failed to fetch all menus for ${date} by 12:30 KST after ${attempt + 1} attempts.\n\n${summary}`,
    );
  },
});

/** Re-scrape only when we still have no live menu (posted dishes or a closed notice). */
export const refreshStaleForToday = internalAction({
  args: {},
  handler: async (ctx): Promise<void> => {
    const date = todayKst();
    for (const cafeteria of CAFETERIAS) {
      const existing = await ctx.runQuery(internal.menus.getMenuForDate, {
        date,
        cafeteria,
      });
      if (isFreshForServing(existing)) continue;
      await ctx.runAction(internal.menus.scrapeAndEnrich, { cafeteria });
    }
  },
});
