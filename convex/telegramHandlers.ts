import type { TrackEvent } from "./analytics";
import { EVENT_START, EVENT_TODAY_MENU } from "./analytics";
import { formatKstClock } from "./dates";
import { formatMenuMessage } from "./format";
import { shouldSendMorningPush } from "./morningPushPolicy";
import type { StoredMenuLike } from "./refreshPolicy";
import type { Cafeteria, Dish, ScrapeResult } from "./types";
import { TELEGRAM_SEND_TIMEOUT_MS, type InlineKeyboardMarkup } from "./telegramClient";
import { withTimeout } from "./asyncTimeout";

export const TODAY_MENU_CALLBACK = "today_menu";
export const TODAY_MENU_BUTTON_LABEL = "Сегодняшнее меню";
export const SUBSCRIBE_CALLBACK = "morning_subscribe";
export const UNSUBSCRIBE_CALLBACK = "morning_unsubscribe";
export const SUBSCRIBE_BUTTON_LABEL = "Присылать утром";
export const UNSUBSCRIBE_BUTTON_LABEL = "Отписаться";
export const SUBSCRIBED_MESSAGE = "Буду присылать меню по утрам.";
export const UNSUBSCRIBED_MESSAGE = "Больше не буду присылать утром.";
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
  /** Atomically claim a Telegram update_id. Return false if already claimed. */
  claimUpdateId?: (updateId: number) => Promise<boolean>;
  isSubscribed?: (chatId: number) => Promise<boolean>;
  subscribe?: (chatId: number) => Promise<void>;
  unsubscribe?: (chatId: number) => Promise<void>;
};

export function todayMenuKeyboard(subscribed = false): InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [{ text: TODAY_MENU_BUTTON_LABEL, callback_data: TODAY_MENU_CALLBACK }],
      [
        subscribed
          ? {
              text: UNSUBSCRIBE_BUTTON_LABEL,
              callback_data: UNSUBSCRIBE_CALLBACK,
            }
          : {
              text: SUBSCRIBE_BUTTON_LABEL,
              callback_data: SUBSCRIBE_CALLBACK,
            },
      ],
    ],
  };
}

async function keyboardFor(
  chatId: number,
  deps: TelegramDeps,
): Promise<InlineKeyboardMarkup> {
  const subscribed = deps.isSubscribed
    ? await deps.isSubscribed(chatId)
    : false;
  return todayMenuKeyboard(subscribed);
}

type MessageUpdate = {
  update_id?: number;
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

export type MorningSubscriber = {
  chatId: number;
  lastPushedDate?: string;
};

export type MorningSendResult = {
  ok: boolean;
  blocked?: boolean;
};

export type MorningPushSummary = {
  sent: number;
  failed: number;
  skipped: number;
  dropped: number;
};

/**
 * One menu message per opted-in chat. Failed sends do not abort the batch.
 * Blocked chats are dropped so we do not retry them forever.
 */
export async function deliverMorningPushes(args: {
  today: string;
  peony: StoredMenuLike;
  azilea: StoredMenuLike;
  subscribers: MorningSubscriber[];
  send: (
    chatId: number,
    text: string,
    options?: { reply_markup?: InlineKeyboardMarkup },
  ) => Promise<MorningSendResult>;
  markPushed: (chatId: number) => Promise<void>;
  dropSubscriber: (chatId: number) => Promise<void>;
  menuText: string;
  sendTimeoutMs?: number;
  /** Atomically claim this chat for today. When set, replaces lastPushedDate skip. */
  claimDelivery?: (chatId: number) => Promise<boolean>;
  /** Undo a claim after a failed / thrown send so a later retry can deliver. */
  releaseClaim?: (chatId: number) => Promise<void>;
  /** Clear the in-flight marker after a successful send. */
  completeDelivery?: (chatId: number) => Promise<void>;
}): Promise<MorningPushSummary> {
  const summary: MorningPushSummary = {
    sent: 0,
    failed: 0,
    skipped: 0,
    dropped: 0,
  };
  if (
    !shouldSendMorningPush({
      today: args.today,
      peony: args.peony,
      azilea: args.azilea,
    })
  ) {
    return summary;
  }

  const text = args.menuText;
  const keyboard = todayMenuKeyboard(true);
  const sendTimeoutMs = args.sendTimeoutMs ?? TELEGRAM_SEND_TIMEOUT_MS;

  const releaseIfNeeded = async (chatId: number) => {
    if (!args.releaseClaim) return;
    try {
      await args.releaseClaim(chatId);
    } catch (err) {
      console.error(
        `morning push release ${chatId} failed: ${(err as Error).message}`,
      );
    }
  };

  for (const subscriber of args.subscribers) {
    // claimDelivery is the atomic skip path; lastPushedDate remains for tests
    // that do not pass claim callbacks.
    if (args.claimDelivery) {
      let claimed = false;
      try {
        claimed = await args.claimDelivery(subscriber.chatId);
      } catch (err) {
        console.error(
          `morning push claim ${subscriber.chatId} failed: ${(err as Error).message}`,
        );
        summary.failed += 1;
        continue;
      }
      if (!claimed) {
        summary.skipped += 1;
        continue;
      }
    } else if (subscriber.lastPushedDate === args.today) {
      summary.skipped += 1;
      continue;
    }
    try {
      const result = await withTimeout(
        args.send(subscriber.chatId, text, {
          reply_markup: keyboard,
        }),
        sendTimeoutMs,
        `morning push to ${subscriber.chatId} timed out after ${sendTimeoutMs}ms`,
      );
      if (result.blocked) {
        await args.dropSubscriber(subscriber.chatId);
        summary.dropped += 1;
        continue;
      }
      if (!result.ok) {
        await releaseIfNeeded(subscriber.chatId);
        summary.failed += 1;
        continue;
      }
      if (args.completeDelivery) {
        await args.completeDelivery(subscriber.chatId);
      } else {
        await args.markPushed(subscriber.chatId);
      }
      summary.sent += 1;
    } catch (err) {
      console.error(
        `morning push to ${subscriber.chatId} failed: ${(err as Error).message}`,
      );
      await releaseIfNeeded(subscriber.chatId);
      summary.failed += 1;
    }
  }
  return summary;
}

function telegramUpdateId(update: MessageUpdate): number | undefined {
  return typeof update.update_id === "number" && Number.isFinite(update.update_id)
    ? update.update_id
    : undefined;
}

async function handleAdminCommand(
  command: AdminCommand,
  chatId: number,
  deps: TelegramDeps,
  updateId: number | undefined,
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

  if (deps.claimUpdateId && updateId != null) {
    const claimed = await deps.claimUpdateId(updateId);
    if (!claimed) return;
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
 * - any message → prompt + today + subscribe/unsubscribe buttons
 * - ADMIN_CHAT_ID only: /status, /refetch, /stats
 * - callback "today_menu" → today's Peony + Azilea menus
 * - callback morning_subscribe / morning_unsubscribe → opt-in table
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

    if (callback.data === SUBSCRIBE_CALLBACK) {
      try {
        if (deps.subscribe) await deps.subscribe(chatId);
        await deps.sendMessage(chatId, SUBSCRIBED_MESSAGE, {
          reply_markup: todayMenuKeyboard(true),
        });
      } catch (err) {
        console.error(`morning_subscribe failed: ${(err as Error).message}`);
        await deps.sendMessage(
          chatId,
          "Не удалось подписаться. Попробуйте позже.",
          { reply_markup: await keyboardFor(chatId, deps) },
        );
      }
      return "ok";
    }

    if (callback.data === UNSUBSCRIBE_CALLBACK) {
      try {
        if (deps.unsubscribe) await deps.unsubscribe(chatId);
        await deps.sendMessage(chatId, UNSUBSCRIBED_MESSAGE, {
          reply_markup: todayMenuKeyboard(false),
        });
      } catch (err) {
        console.error(`morning_unsubscribe failed: ${(err as Error).message}`);
        await deps.sendMessage(
          chatId,
          "Не удалось отписаться. Попробуйте позже.",
          { reply_markup: await keyboardFor(chatId, deps) },
        );
      }
      return "ok";
    }

    if (callback.data !== TODAY_MENU_CALLBACK) {
      return "ok";
    }

    await safeTrack(deps.trackEvent, EVENT_TODAY_MENU);

    try {
      const today = await deps.getTodayMenus();
      const text = formatMenuMessage(today.peony, today.azilea);
      await deps.sendMessage(chatId, text, {
        reply_markup: await keyboardFor(chatId, deps),
      });
    } catch (err) {
      console.error(`today_menu handler failed: ${(err as Error).message}`);
      await deps.sendMessage(
        chatId,
        "Не удалось получить меню. Попробуйте позже.",
        { reply_markup: await keyboardFor(chatId, deps) },
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
    await handleAdminCommand(command, chatId, deps, telegramUpdateId(u));
    return "ok";
  }

  await deps.sendMessage(chatId, START_PROMPT, {
    reply_markup: await keyboardFor(chatId, deps),
  });
  await safeTrack(deps.trackEvent, EVENT_START);
  return "ok";
}
