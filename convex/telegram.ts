import { httpAction, internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { trackAptabaseEvent } from "./analytics";
import {
  answerCallbackQuery,
  sendAdminAlert,
  sendMessage,
} from "./telegramClient";
import { processTelegramUpdate, toAdminStatus } from "./telegramHandlers";
import { isAuthorizedWebhook } from "./webhookAuth";
import {
  fetchTelegramWebhookInfo,
  registerTelegramWebhook,
} from "./telegramWebhook";

export { sendAdminAlert, sendMessage };

/**
 * Register Telegram's webhook at this deployment's CONVEX_SITE_URL.
 * Run against **dev** or **prod** separately — each deployment has its own
 * TELEGRAM_BOT_TOKEN, so this cannot steal the other environment's updates.
 */
export const setWebhook = internalAction({
  args: {},
  handler: async () => {
    const result = await registerTelegramWebhook({
      siteUrl: process.env.CONVEX_SITE_URL,
      botToken: process.env.TELEGRAM_BOT_TOKEN,
      secretToken: process.env.TELEGRAM_WEBHOOK_SECRET,
      apiBase: process.env.TELEGRAM_API_BASE,
    });
    if (!result.ok) {
      throw new Error(result.error);
    }
    return result;
  },
});

/** Inspect the webhook currently registered for this deployment's bot token. */
export const getWebhookInfo = internalAction({
  args: {},
  handler: async () => {
    const result = await fetchTelegramWebhookInfo({
      botToken: process.env.TELEGRAM_BOT_TOKEN,
      apiBase: process.env.TELEGRAM_API_BASE,
    });
    if (!result.ok) {
      throw new Error(result.error);
    }
    return result;
  },
});

export const handleWebhook = httpAction(async (ctx, request) => {
  const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
  const provided = request.headers.get("x-telegram-bot-api-secret-token");
  if (!isAuthorizedWebhook(expectedSecret, provided)) {
    if (!expectedSecret) {
      console.error("TELEGRAM_WEBHOOK_SECRET is not set; rejecting webhook");
    }
    return new Response("unauthorized", { status: 401 });
  }

  let update: unknown;
  try {
    update = await request.json();
  } catch {
    return new Response("bad request", { status: 400 });
  }

  await processTelegramUpdate(update, {
    getTodayMenus: async () => {
      // Re-fetch only when there is still no live menu. If the cafeteria
      // posted a closed notice, that counts as a menu and we stop.
      await ctx.runAction(internal.menus.refreshStaleForToday, {});
      const today = await ctx.runQuery(internal.menus.getTodayBoth, {});
      return { peony: today.peony, azilea: today.azilea };
    },
    sendMessage,
    answerCallbackQuery,
    trackEvent: trackAptabaseEvent,
    adminChatId: process.env.ADMIN_CHAT_ID,
    aptabaseDashboardUrl: process.env.APTABASE_DASHBOARD_URL,
    getAdminStatus: async () => {
      const today = await ctx.runQuery(internal.menus.getTodayBoth, {});
      const attempts = await ctx.runQuery(internal.menus.listAttemptsForDate, {
        date: today.date,
      });
      return toAdminStatus(today.date, today.peony, today.azilea, attempts);
    },
    refetchToday: async () => {
      const result = await ctx.runAction(internal.menus.refetchToday, {
        force: true,
      });
      return {
        date: result.date,
        results: result.results,
        telegramMessage: result.telegramMessage,
      };
    },
  });

  return new Response("ok", { status: 200 });
});
