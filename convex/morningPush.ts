import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { formatMenuMessage } from "./format";
import { shouldSendMorningPush } from "./morningPushPolicy";
import { sendMessageResult } from "./telegramClient";
import { deliverMorningPushes } from "./telegramHandlers";

export const pushIfReady = internalAction({
  args: {},
  handler: async (ctx) => {
    const today = await ctx.runQuery(internal.menus.getTodayBoth, {});
    const peony = today.peony;
    const azilea = today.azilea;

    if (
      !shouldSendMorningPush({
        today: today.date,
        peony,
        azilea,
      })
    ) {
      console.log(`morningPush: skip date=${today.date}`);
      return { sent: 0, failed: 0, skipped: 0, dropped: 0 };
    }

    const subscribers = await ctx.runQuery(internal.subscribers.listAll, {});
    const menuText = formatMenuMessage(today.peony, today.azilea);
    const summary = await deliverMorningPushes({
      today: today.date,
      peony,
      azilea,
      subscribers: subscribers.map((row) => ({
        chatId: row.chatId,
        lastPushedDate: row.lastPushedDate,
      })),
      menuText,
      send: async (chatId, text, options) =>
        sendMessageResult(chatId, text, options),
      markPushed: async (chatId) => {
        await ctx.runMutation(internal.subscribers.markPushed, {
          chatId,
          date: today.date,
        });
      },
      dropSubscriber: async (chatId) => {
        await ctx.runMutation(internal.subscribers.unsubscribe, { chatId });
      },
    });
    console.log(
      `morningPush: date=${today.date} sent=${summary.sent} failed=${summary.failed} skipped=${summary.skipped} dropped=${summary.dropped}`,
    );
    return summary;
  },
});
