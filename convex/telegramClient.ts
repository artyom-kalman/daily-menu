/** Low-level Telegram Bot API helpers. Base URL is overridable for E2E mocks. */

export type InlineKeyboardMarkup = {
  inline_keyboard: Array<Array<{ text: string; callback_data: string }>>;
};

export type SendMessageOptions = {
  reply_markup?: InlineKeyboardMarkup;
};

function telegramApiBase(): string {
  return process.env.TELEGRAM_API_BASE || "https://api.telegram.org";
}

function botToken(): string | undefined {
  return process.env.TELEGRAM_BOT_TOKEN;
}

async function callTelegram(
  method: string,
  body: Record<string, unknown>,
): Promise<boolean> {
  const token = botToken();
  if (!token) {
    console.warn(`TELEGRAM_BOT_TOKEN not set; skipping ${method}`);
    return false;
  }
  try {
    const res = await fetch(`${telegramApiBase()}/bot${token}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.warn(`Telegram ${method} HTTP ${res.status}: ${text.slice(0, 500)}`);
      return false;
    }
    return true;
  } catch (err) {
    console.warn(`Telegram ${method} failed: ${(err as Error).message}`);
    return false;
  }
}

export async function sendMessage(
  chatId: number | string,
  text: string,
  options: SendMessageOptions = {},
): Promise<boolean> {
  return callTelegram("sendMessage", {
    chat_id: chatId,
    text,
    disable_web_page_preview: true,
    ...(options.reply_markup
      ? { reply_markup: options.reply_markup }
      : {}),
  });
}

export async function answerCallbackQuery(
  callbackQueryId: string,
  text?: string,
): Promise<boolean> {
  return callTelegram("answerCallbackQuery", {
    callback_query_id: callbackQueryId,
    ...(text ? { text } : {}),
  });
}

export async function sendAdminAlert(text: string): Promise<void> {
  const chatId = process.env.ADMIN_CHAT_ID;
  if (!chatId) {
    console.warn("ADMIN_CHAT_ID not set; skipping admin alert");
    return;
  }
  await sendMessage(chatId, text);
}
