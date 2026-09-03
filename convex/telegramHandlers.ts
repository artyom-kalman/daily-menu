import { formatMenuMessage } from "./format";
import type { Dish } from "./types";
import type { InlineKeyboardMarkup } from "./telegramClient";

export const TODAY_MENU_CALLBACK = "today_menu";
export const TODAY_MENU_BUTTON_LABEL = "Сегодняшнее меню";
export const START_PROMPT =
  "Нажмите кнопку, чтобы увидеть меню на сегодня.";

type MenuLike = { dishes: Dish[] } | null;

export type TodayMenus = {
  peony: MenuLike;
  azilea: MenuLike;
};

export type TelegramDeps = {
  getTodayMenus: () => Promise<TodayMenus>;
  sendMessage: (
    chatId: number | string,
    text: string,
    options?: { reply_markup?: InlineKeyboardMarkup },
  ) => Promise<unknown>;
  answerCallbackQuery: (
    callbackQueryId: string,
    text?: string,
  ) => Promise<unknown>;
};

export function todayMenuKeyboard(): InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [{ text: TODAY_MENU_BUTTON_LABEL, callback_data: TODAY_MENU_CALLBACK }],
    ],
  };
}

type MessageUpdate = {
  message?: {
    chat?: { id?: number };
    text?: string;
  };
  callback_query?: {
    id?: string;
    data?: string;
    message?: { chat?: { id?: number } };
    from?: { id?: number };
  };
};

/**
 * Stateless Telegram bot logic:
 * - any message → prompt + one inline button
 * - callback "today_menu" → today's Peony + Azilea menus
 */
export async function processTelegramUpdate(
  update: unknown,
  deps: TelegramDeps,
): Promise<"ok" | "ignored"> {
  const u = update as MessageUpdate;

  const callback = u.callback_query;
  if (callback) {
    const chatId =
      callback.message?.chat?.id ??
      (typeof callback.from?.id === "number" ? callback.from.id : undefined);
    const callbackId = callback.id;
    if (typeof chatId !== "number" || typeof callbackId !== "string") {
      return "ignored";
    }

    await deps.answerCallbackQuery(callbackId);

    if (callback.data !== TODAY_MENU_CALLBACK) {
      return "ok";
    }

    try {
      const today = await deps.getTodayMenus();
      const text = formatMenuMessage(today.peony, today.azilea);
      await deps.sendMessage(chatId, text);
    } catch (err) {
      console.error(`today_menu handler failed: ${(err as Error).message}`);
      await deps.sendMessage(
        chatId,
        "Не удалось получить меню. Попробуйте позже.",
      );
    }
    return "ok";
  }

  const chatId = u.message?.chat?.id;
  if (typeof chatId !== "number") {
    return "ignored";
  }

  await deps.sendMessage(chatId, START_PROMPT, {
    reply_markup: todayMenuKeyboard(),
  });
  return "ok";
}
