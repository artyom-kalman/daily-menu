import { httpAction } from "./_generated/server";
import { api, internal } from "./_generated/api";
import {
  answerCallbackQuery,
  sendAdminAlert,
  sendMessage,
} from "./telegramClient";
import { processTelegramUpdate } from "./telegramHandlers";

export { sendAdminAlert, sendMessage };

export const handleWebhook = httpAction(async (ctx, request) => {
  const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (expectedSecret) {
    const provided = request.headers.get("x-telegram-bot-api-secret-token");
    if (provided !== expectedSecret) {
      return new Response("unauthorized", { status: 401 });
    }
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
      const today = await ctx.runQuery(api.menus.getTodayBoth, {});
      return { peony: today.peony, azilea: today.azilea };
    },
    sendMessage,
    answerCallbackQuery,
  });

  return new Response("ok", { status: 200 });
});
