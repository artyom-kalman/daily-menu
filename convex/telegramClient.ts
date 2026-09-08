/** Low-level Telegram Bot API helpers. Base URL is overridable for E2E mocks. */

export type InlineKeyboardMarkup = {
  inline_keyboard: Array<Array<{ text: string; callback_data: string }>>;
};

export type SendMessageOptions = {
  reply_markup?: InlineKeyboardMarkup;
};

export type TelegramCallResult = {
  ok: boolean;
  status?: number;
  description?: string;
  blocked?: boolean;
};

function telegramApiBase(): string {
  return process.env.TELEGRAM_API_BASE || "https://api.telegram.org";
}

function botToken(): string | undefined {
  return process.env.TELEGRAM_BOT_TOKEN;
}

/** Drop the subscriber: blocked, kicked, deactivated, or chat gone. */
export function isBlockedTelegramError(
  status: number,
  description: string,
): boolean {
  if (status === 403) return true;
  return /blocked by the user|chat not found|user is deactivated|bot was kicked/i.test(
    description,
  );
}

async function callTelegram(
  method: string,
  body: Record<string, unknown>,
): Promise<TelegramCallResult> {
  const token = botToken();
  if (!token) {
    console.warn(`TELEGRAM_BOT_TOKEN not set; skipping ${method}`);
    return { ok: false, description: "TELEGRAM_BOT_TOKEN not set" };
  }
  try {
    const res = await fetch(`${telegramApiBase()}/bot${token}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const text = await res.text().catch(() => "");
    let parsed: { ok?: boolean; error_code?: number; description?: string } | null =
      null;
    try {
      parsed = text ? (JSON.parse(text) as {
        ok?: boolean;
        error_code?: number;
        description?: string;
      }) : null;
    } catch {
      parsed = null;
    }
    const description = parsed?.description ?? text.slice(0, 500);
    const status = parsed?.error_code ?? res.status;
    const ok = res.ok && parsed?.ok !== false;
    if (!ok) {
      console.warn(
        `Telegram ${method} HTTP ${res.status}: ${description.slice(0, 500)}`,
      );
      return {
        ok: false,
        status,
        description,
        blocked: isBlockedTelegramError(status, description),
      };
    }
    return { ok: true, status: res.status };
  } catch (err) {
    console.warn(`Telegram ${method} failed: ${(err as Error).message}`);
    return { ok: false, description: (err as Error).message };
  }
}

export async function sendMessage(
  chatId: number | string,
  text: string,
  options: SendMessageOptions = {},
): Promise<boolean> {
  const result = await sendMessageResult(chatId, text, options);
  return result.ok;
}

export async function sendMessageResult(
  chatId: number | string,
  text: string,
  options: SendMessageOptions = {},
): Promise<TelegramCallResult> {
  return callTelegram("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
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
  const result = await callTelegram("answerCallbackQuery", {
    callback_query_id: callbackQueryId,
    ...(text ? { text } : {}),
  });
  return result.ok;
}

export async function sendAdminAlert(text: string): Promise<void> {
  const chatId = process.env.ADMIN_CHAT_ID;
  if (!chatId) {
    console.warn("ADMIN_CHAT_ID not set; skipping admin alert");
    return;
  }
  await sendMessage(chatId, text);
}
