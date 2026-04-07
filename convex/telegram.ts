import { httpAction } from "./_generated/server";
import { api } from "./_generated/api";
import { formatMenuMessage } from "./format";

const TELEGRAM_API = "https://api.telegram.org";

export async function sendMessage(
  chatId: number | string,
  text: string,
): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.warn("TELEGRAM_BOT_TOKEN not set; skipping sendMessage");
    return;
  }
  try {
    const res = await fetch(`${TELEGRAM_API}/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        disable_web_page_preview: true,
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.warn(`Telegram sendMessage HTTP ${res.status}: ${body.slice(0, 500)}`);
    }
  } catch (err) {
    console.warn(`Telegram sendMessage failed: ${(err as Error).message}`);
  }
}

export async function sendAdminAlert(text: string): Promise<void> {
  const chatId = process.env.ADMIN_CHAT_ID;
  if (!chatId) {
    console.warn("ADMIN_CHAT_ID not set; skipping admin alert");
    return;
  }
  await sendMessage(chatId, text);
}

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

  const message = (update as { message?: { chat?: { id?: number } } }).message;
  const chatId = message?.chat?.id;
  if (typeof chatId !== "number") {
    // Ignore non-message updates (edits, callbacks, etc.).
    return new Response("ok", { status: 200 });
  }

  try {
    const today = await ctx.runQuery(api.menus.getTodayBoth, {});
    const text = formatMenuMessage(today.peony, today.azilea);
    await sendMessage(chatId, text);
  } catch (err) {
    console.error(`webhook handler failed: ${(err as Error).message}`);
    await sendMessage(
      chatId,
      "Не удалось получить меню. Попробуйте позже.",
    );
  }

  return new Response("ok", { status: 200 });
});
