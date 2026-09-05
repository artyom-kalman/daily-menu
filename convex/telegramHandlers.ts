import type { TrackEvent } from "./analytics";
import { EVENT_START, EVENT_TODAY_MENU } from "./analytics";
import { formatKstClock } from "./dates";
import { formatMenuMessage } from "./format";
import type { Cafeteria, Dish, ScrapeResult } from "./types";
import type { InlineKeyboardMarkup } from "./telegramClient";

export const TODAY_MENU_CALLBACK = "today_menu";
export const TODAY_MENU_BUTTON_LABEL = "Сегодняшнее меню";
export const START_PROMPT =
  "Нажмите кнопку, чтобы увидеть меню на сегодня.";

export const REFETCHING_MESSAGE = "Refetching…";
export const STATS_UNSET_MESSAGE = "APTABASE_DASHBOARD_URL is not set";

export type AdminCommand = "status" | "refetch" | "stats";

type MenuLike = { dishes: Dish[] } | null;

export type TodayMenus = {
  peony: MenuLike;
  azilea: MenuLike;
};

export type AdminMenuLike = {
  source: string;
  dishes: unknown[];
  fetchedAt: number;
} | null;

export type AdminAttemptLike = {
  cafeteria: string;
  status: "success" | "empty" | "error";
  attemptedAt: number;
  error?: string;
};

export type AdminCafeteriaStatus = {
  source: string | null;
  dishCount: number;
  fetchedAt: number | null;
  lastAttempt: AdminAttemptLike | null;
  attemptCount: number;
};

export type AdminStatus = {
  date: string;
  peony: AdminCafeteriaStatus;
  azilea: AdminCafeteriaStatus;
};

export type AdminRefetchResult = {
  date: string;
  results: Record<Cafeteria, ScrapeResult>;
  telegramMessage: string;
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
  trackEvent?: TrackEvent;
  adminChatId?: string;
  aptabaseDashboardUrl?: string;
  getAdminStatus?: () => Promise<AdminStatus>;
  refetchToday?: () => Promise<AdminRefetchResult>;
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

async function safeTrack(
  trackEvent: TrackEvent | undefined,
  eventName: Parameters<TrackEvent>[0],
): Promise<void> {
  if (!trackEvent) return;
  try {
    await trackEvent(eventName);
  } catch (err) {
    console.warn(`trackEvent(${eventName}) failed: ${(err as Error).message}`);
  }
}

export function parseAdminCommand(text: string | undefined): AdminCommand | null {
  if (!text) return null;
  const token = text.trim().split(/\s+/)[0] ?? "";
  if (!token.startsWith("/")) return null;
  const name = token.slice(1).split("@")[0]?.toLowerCase();
  if (name === "status" || name === "refetch" || name === "stats") return name;
  return null;
}

export function isAdminChat(
  chatId: number,
  adminChatId: string | undefined,
): boolean {
  if (!adminChatId) return false;
  return String(chatId) === adminChatId.trim();
}

function lastAttemptFor(
  attempts: AdminAttemptLike[],
  cafeteria: Cafeteria,
): AdminAttemptLike | null {
  const rows = attempts.filter((a) => a.cafeteria === cafeteria);
  if (rows.length === 0) return null;
  return rows.reduce((best, row) =>
    row.attemptedAt >= best.attemptedAt ? row : best,
  );
}

function cafeteriaStatus(
  menu: AdminMenuLike,
  attempts: AdminAttemptLike[],
  cafeteria: Cafeteria,
): AdminCafeteriaStatus {
  const cafeAttempts = attempts.filter((a) => a.cafeteria === cafeteria);
  return {
    source: menu?.source ?? null,
    dishCount: menu?.dishes.length ?? 0,
    fetchedAt: menu?.fetchedAt ?? null,
    lastAttempt: lastAttemptFor(attempts, cafeteria),
    attemptCount: cafeAttempts.length,
  };
}

export function toAdminStatus(
  date: string,
  peony: AdminMenuLike,
  azilea: AdminMenuLike,
  attempts: AdminAttemptLike[],
): AdminStatus {
  return {
    date,
    peony: cafeteriaStatus(peony, attempts, "peony"),
    azilea: cafeteriaStatus(azilea, attempts, "azilea"),
  };
}

function plural(count: number, singular: string, pluralForm: string): string {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

function formatCafeteriaStatus(
  label: string,
  row: AdminCafeteriaStatus,
): string {
  const source = row.source ?? "missing";
  const fetched =
    row.fetchedAt != null ? `  fetched ${formatKstClock(row.fetchedAt)}` : "";
  const header =
    row.source == null
      ? `${label}  missing`
      : `${label}  ${source}  ${plural(row.dishCount, "dish", "dishes")}${fetched}`;

  const attempts = `(${plural(row.attemptCount, "attempt", "attempts")})`;
  if (!row.lastAttempt) {
    return `${header}\n  last: none  ${attempts}`;
  }
  const when = formatKstClock(row.lastAttempt.attemptedAt);
  const error = row.lastAttempt.error ? ` — ${row.lastAttempt.error}` : "";
  return `${header}\n  last: ${row.lastAttempt.status} ${when}${error}  ${attempts}`;
}

export function formatAdminStatus(status: AdminStatus): string {
  return (
    `${status.date} KST\n\n` +
    formatCafeteriaStatus("Peony", status.peony) +
    "\n\n" +
    formatCafeteriaStatus("Azilea", status.azilea)
  );
}

export function formatRefetchSummary(
  date: string,
  results: Record<Cafeteria, ScrapeResult>,
): string {
  const lines = (["peony", "azilea"] as const).map((cafeteria) => {
    const label = cafeteria === "peony" ? "Peony" : "Azilea";
    const result = results[cafeteria];
    if (!result.ok) {
      const detail = result.error ? ` (${result.error})` : "";
      return `${label}: error${detail}`;
    }
    return `${label}: ok (${result.dishCount})`;
  });
  return `Refetch ${date}\n${lines.join("\n")}`;
}

async function handleAdminCommand(
  command: AdminCommand,
  chatId: number,
  deps: TelegramDeps,
): Promise<void> {
  if (command === "status") {
    if (!deps.getAdminStatus) {
      await deps.sendMessage(chatId, "Status is unavailable.");
      return;
    }
    try {
      const status = await deps.getAdminStatus();
      await deps.sendMessage(chatId, formatAdminStatus(status));
    } catch (err) {
      console.error(`/status failed: ${(err as Error).message}`);
      await deps.sendMessage(chatId, `Status failed: ${(err as Error).message}`);
    }
    return;
  }

  if (command === "stats") {
    const url = deps.aptabaseDashboardUrl?.trim();
    await deps.sendMessage(
      chatId,
      url ? `Analytics: ${url}` : STATS_UNSET_MESSAGE,
    );
    return;
  }

  await deps.sendMessage(chatId, REFETCHING_MESSAGE);
  if (!deps.refetchToday) {
    await deps.sendMessage(chatId, "Refetch is unavailable.");
    return;
  }
  try {
    const result = await deps.refetchToday();
    await deps.sendMessage(
      chatId,
      formatRefetchSummary(result.date, result.results),
    );
    await deps.sendMessage(chatId, result.telegramMessage);
  } catch (err) {
    console.error(`/refetch failed: ${(err as Error).message}`);
    await deps.sendMessage(chatId, `Refetch failed: ${(err as Error).message}`);
  }
}

/**
 * Stateless Telegram bot logic:
 * - any message → prompt + one inline button
 * - ADMIN_CHAT_ID only: /status, /refetch, /stats
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

    await safeTrack(deps.trackEvent, EVENT_TODAY_MENU);

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

  const command = parseAdminCommand(u.message?.text);
  if (command && isAdminChat(chatId, deps.adminChatId)) {
    await handleAdminCommand(command, chatId, deps);
    return "ok";
  }

  await deps.sendMessage(chatId, START_PROMPT, {
    reply_markup: todayMenuKeyboard(),
  });
  await safeTrack(deps.trackEvent, EVENT_START);
  return "ok";
}
