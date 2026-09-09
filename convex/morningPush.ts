import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { kstHourMinute } from "./dates";
import { formatMenuMessage } from "./format";
import { formatPorkNote } from "./pork";
import { shouldSendMorningPush } from "./morningPushPolicy";
import { inMorningPushWindow } from "./refreshPolicy";
import { sendMessageResult } from "./telegramClient";
import { deliverMorningPushes } from "./telegramHandlers";

export const pushIfReady = internalAction({
  args: {},
  handler: async (ctx) => {
    const { hour, minute } = kstHourMinute();
    if (!inMorningPushWindow(hour, minute)) {
      console.log(
        `morningPush: skip outside window kst=${hour}:${String(minute).padStart(2, "0")}`,
      );
      return { sent: 0, failed: 0, skipped: 0, dropped: 0 };
    }

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
    const porkWatchers = await ctx.runQuery(internal.porkWatchers.listAll, {});
    const watchingPork = new Set(
      porkWatchers.map((row: { chatId: number }) => row.chatId),
    );
    const menuText = formatMenuMessage(today.peony, today.azilea);
    const porkNoteText = formatPorkNote(today.peony, today.azilea);
    const summary = await deliverMorningPushes({
      today: today.date,
      peony,
      azilea,
      subscribers: subscribers.map((row: { chatId: number; lastPushedDate?: string }) => ({
        chatId: row.chatId,
        lastPushedDate: row.lastPushedDate,
      })),
      menuText,
      porkNoteText,
      isWatchingPork: async (chatId) => watchingPork.has(chatId),
      send: async (chatId, text, options) =>
        sendMessageResult(chatId, text, options),
      markPushed: async (chatId) => {
        await ctx.runMutation(internal.subscribers.markPushed, {
          chatId,
          date: today.date,
        });
      },
      claimDelivery: async (chatId) => {
        const result = await ctx.runMutation(internal.subscribers.claimPush, {
          chatId,
          date: today.date,
          nowMs: Date.now(),
          staleAfterMs: 60_000,
        });
        return result.claimed;
      },
      completeDelivery: async (chatId) => {
        await ctx.runMutation(internal.subscribers.completePush, {
          chatId,
          date: today.date,
        });
      },
      releaseClaim: async (chatId) => {
        await ctx.runMutation(internal.subscribers.releasePushClaim, {
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
