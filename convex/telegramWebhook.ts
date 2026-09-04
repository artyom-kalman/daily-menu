/** Telegram webhook URL + setWebhook helpers. Testable without a Convex deploy. */

export const TELEGRAM_WEBHOOK_PATH = "/telegram/webhook";

export type SetWebhookResult =
  | { ok: true; url: string }
  | { ok: false; error: string };

export type WebhookInfoResult =
  | { ok: true; url: string; pendingUpdateCount?: number }
  | { ok: false; error: string };

function trimSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function telegramApiBase(explicit?: string): string {
  return trimSlash(explicit || "https://api.telegram.org");
}

/** HTTP site URL for this Convex deployment → Telegram webhook path. */
export function webhookUrlFromSiteUrl(siteUrl: string): string {
  return `${trimSlash(siteUrl)}${TELEGRAM_WEBHOOK_PATH}`;
}

async function postTelegramJson(
  apiBase: string,
  botToken: string,
  method: string,
  body: Record<string, unknown>,
): Promise<{ httpOk: boolean; status: number; parsed: Record<string, unknown>; text: string }> {
  const res = await fetch(`${telegramApiBase(apiBase)}/bot${botToken}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text().catch(() => "");
  let parsed: Record<string, unknown> = {};
  try {
    parsed = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    parsed = {};
  }
  return { httpOk: res.ok, status: res.status, parsed, text };
}

function telegramError(
  parsed: Record<string, unknown>,
  status: number,
  text: string,
  method: string,
): string {
  const description =
    typeof parsed.description === "string" ? parsed.description : undefined;
  return description || `Telegram ${method} HTTP ${status}: ${text.slice(0, 500)}`;
}

/**
 * Point this bot token at this deployment's HTTP site URL.
 * Callers must pass the *current* deployment's CONVEX_SITE_URL / token / secret
 * so a prod token cannot be aimed at a dev URL by pasting.
 */
export async function registerTelegramWebhook(opts: {
  siteUrl: string | undefined;
  botToken: string | undefined;
  secretToken: string | undefined;
  apiBase?: string;
}): Promise<SetWebhookResult> {
  if (!opts.siteUrl) {
    return { ok: false, error: "CONVEX_SITE_URL is not set" };
  }
  if (!opts.botToken) {
    return { ok: false, error: "TELEGRAM_BOT_TOKEN is not set" };
  }
  if (!opts.secretToken) {
    return { ok: false, error: "TELEGRAM_WEBHOOK_SECRET is not set" };
  }

  const url = webhookUrlFromSiteUrl(opts.siteUrl);
  try {
    const { httpOk, status, parsed, text } = await postTelegramJson(
      opts.apiBase ?? "",
      opts.botToken,
      "setWebhook",
      {
        url,
        secret_token: opts.secretToken,
        allowed_updates: ["message", "callback_query"],
      },
    );
    if (!httpOk || parsed.ok === false) {
      return { ok: false, error: telegramError(parsed, status, text, "setWebhook") };
    }
    return { ok: true, url };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export async function fetchTelegramWebhookInfo(opts: {
  botToken: string | undefined;
  apiBase?: string;
}): Promise<WebhookInfoResult> {
  if (!opts.botToken) {
    return { ok: false, error: "TELEGRAM_BOT_TOKEN is not set" };
  }
  try {
    const { httpOk, status, parsed, text } = await postTelegramJson(
      opts.apiBase ?? "",
      opts.botToken,
      "getWebhookInfo",
      {},
    );
    if (!httpOk || parsed.ok === false) {
      return { ok: false, error: telegramError(parsed, status, text, "getWebhookInfo") };
    }
    const result =
      parsed.result && typeof parsed.result === "object"
        ? (parsed.result as Record<string, unknown>)
        : {};
    const url = typeof result.url === "string" ? result.url : "";
    const pendingUpdateCount =
      typeof result.pending_update_count === "number"
        ? result.pending_update_count
        : undefined;
    return { ok: true, url, pendingUpdateCount };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}
