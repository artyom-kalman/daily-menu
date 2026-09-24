import type { TrackEvent } from "./analytics";
import { EVENT_CHANNEL_POST, EVENT_START, EVENT_TODAY_MENU } from "./analytics";
import { formatKstClock } from "./dates";
import { formatMenuMessage, type FormatMenuLike } from "./format";
import {
  DEFAULT_HALL_PREF,
  HALL_AZILEA_CALLBACK,
  HALL_PEONY_CALLBACK,
  hallFromCallback,
  includesHall,
  parseHallPref,
  toggleHall,
  type HallPref,
} from "./halls";
import {
  DEFAULT_LOCALE,
  LANGUAGE_PROMPT,
  localeCallback,
  localeFromCallback,
  parseLocale,
  t,
  type Locale,
  type UiStrings,
} from "./i18n";
import { shouldSendMorningPush } from "./morningPushPolicy";
import type { StoredMenuLike } from "./refreshPolicy";
import type { Cafeteria, ScrapeResult } from "./types";
import { TELEGRAM_SEND_TIMEOUT_MS, type InlineKeyboardMarkup } from "./telegramClient";
import { isTimeoutError, withTimeout } from "./asyncTimeout";

export { LANGUAGE_PROMPT } from "./i18n";
export { HALL_AZILEA_CALLBACK, HALL_PEONY_CALLBACK } from "./halls";

export const TODAY_MENU_CALLBACK = "today_menu";
export const CHANGE_LANGUAGE_CALLBACK = "change_language";
export const TODAY_MENU_BUTTON_LABEL = t("ru").todayMenu;
export const SUBSCRIBE_CALLBACK = "morning_subscribe";
export const UNSUBSCRIBE_CALLBACK = "morning_unsubscribe";
export const SUBSCRIBE_BUTTON_LABEL = t("ru").subscribe;
export const UNSUBSCRIBE_BUTTON_LABEL = t("ru").unsubscribe;
export const SUBSCRIBED_MESSAGE = t("ru").subscribed;
export const UNSUBSCRIBED_MESSAGE = t("ru").unsubscribed;
export const SUBSCRIBE_FAILED_MESSAGE = t("ru").subscribeFailed;
export const UNSUBSCRIBE_FAILED_MESSAGE = t("ru").unsubscribeFailed;
export const MENU_UNAVAILABLE_MESSAGE = t("ru").menuUnavailable;
export const MENU_NOT_READY_MESSAGE = t("ru").menuNotReady;

export const REFETCHING_MESSAGE = "Refetching…";
export const STATS_UNSET_MESSAGE = "APTABASE_DASHBOARD_URL is not set";

export type AdminCommand = "status" | "refetch" | "stats";

export type TodayMenus = {
  peony: FormatMenuLike;
  azilea: FormatMenuLike;
  /** Weekday, before cutoff, no today's rows — skip scrape, send try-later. */
  awaitingTodaysMenu?: boolean;
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
  peony?: FormatMenuLike;
  azilea?: FormatMenuLike;
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
  editMessageReplyMarkup?: (
    chatId: number | string,
    messageId: number,
    replyMarkup: InlineKeyboardMarkup,
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
  /** Stored locale, or null when the chat has not chosen yet. Omit in tests to treat as ru. */
  getLocale?: (chatId: number) => Promise<string | null>;
  setLocale?: (chatId: number, locale: string) => Promise<void>;
  /** Insert ru if no row exists (morning push). */
  ensureLocale?: (chatId: number) => Promise<string>;
  /** Stored halls, or null when unset (treat as both). */
  getHalls?: (chatId: number) => Promise<string | null>;
  setHalls?: (chatId: number, halls: string) => Promise<void>;
};

function hallButtonLabel(
  copy: UiStrings,
  halls: HallPref,
  hall: "peony" | "azilea",
): string {
  const name = hall === "peony" ? copy.hallPeony : copy.hallAzilea;
  return includesHall(halls, hall) ? `✓ ${name}` : name;
}

function hallsToast(copy: UiStrings, pref: HallPref): string {
  if (pref === "peony") return copy.hallsPeony;
  if (pref === "azilea") return copy.hallsAzilea;
  return copy.hallsBoth;
}

export function todayMenuKeyboard(
  subscribed = false,
  locale: Locale = DEFAULT_LOCALE,
  halls: HallPref = DEFAULT_HALL_PREF,
): InlineKeyboardMarkup {
  const copy = t(locale);
  return {
    inline_keyboard: [
      [{ text: copy.todayMenu, callback_data: TODAY_MENU_CALLBACK }],
      [
        subscribed
          ? {
              text: copy.unsubscribe,
              callback_data: UNSUBSCRIBE_CALLBACK,
            }
          : {
              text: copy.subscribe,
              callback_data: SUBSCRIBE_CALLBACK,
            },
      ],
      [
        {
          text: hallButtonLabel(copy, halls, "peony"),
          callback_data: HALL_PEONY_CALLBACK,
        },
        {
          text: hallButtonLabel(copy, halls, "azilea"),
          callback_data: HALL_AZILEA_CALLBACK,
        },
      ],
      [
        {
          text: copy.changeLanguage,
          callback_data: CHANGE_LANGUAGE_CALLBACK,
        },
      ],
    ],
  };
}

export function languagePickerKeyboard(): InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        { text: t("ru").localeName, callback_data: localeCallback("ru") },
        { text: t("en").localeName, callback_data: localeCallback("en") },
      ],
    ],
  };
}

async function localeForChat(
  chatId: number,
  deps: TelegramDeps,
): Promise<Locale | null> {
  if (!deps.getLocale) return DEFAULT_LOCALE;
  const stored = await deps.getLocale(chatId);
  if (stored == null || stored === "") return null;
  return parseLocale(stored);
}

/** Send paths that skip the picker must persist a row (ru if none exists). */
async function localeOrEnsure(
  chatId: number,
  deps: TelegramDeps,
): Promise<Locale> {
  const stored = await localeForChat(chatId, deps);
  if (stored) return stored;
  if (!deps.ensureLocale) return DEFAULT_LOCALE;
  try {
    return parseLocale(await deps.ensureLocale(chatId));
  } catch (err) {
    console.error(`ensureLocale ${chatId} failed: ${(err as Error).message}`);
    return DEFAULT_LOCALE;
  }
}

async function hallsForChat(
  chatId: number,
  deps: TelegramDeps,
): Promise<HallPref> {
  if (!deps.getHalls) return DEFAULT_HALL_PREF;
  try {
    return parseHallPref(await deps.getHalls(chatId));
  } catch (err) {
    console.error(`getHalls ${chatId} failed: ${(err as Error).message}`);
    return DEFAULT_HALL_PREF;
  }
}

async function keyboardFor(
  chatId: number,
  deps: TelegramDeps,
  locale: Locale,
): Promise<InlineKeyboardMarkup> {
  const subscribed = deps.isSubscribed
    ? await deps.isSubscribed(chatId)
    : false;
  const halls = await hallsForChat(chatId, deps);
  return todayMenuKeyboard(subscribed, locale, halls);
}

function callbackMessageId(
  message: { message_id?: number } | undefined,
): number | undefined {
  return typeof message?.message_id === "number" &&
    Number.isFinite(message.message_id)
    ? message.message_id
    : undefined;
}

async function toastMorningToggle(
  deps: TelegramDeps,
  callbackId: string,
  toast: string,
): Promise<void> {
  try {
    await deps.answerCallbackQuery(callbackId, toast);
  } catch (err) {
    console.warn(
      `answerCallbackQuery toast failed: ${(err as Error).message}`,
    );
  }
}

async function flipMorningKeyboard(
  deps: TelegramDeps,
  chatId: number,
  messageId: number | undefined,
  subscribed: boolean,
  locale: Locale,
): Promise<void> {
  if (messageId == null || !deps.editMessageReplyMarkup) return;
  try {
    const halls = await hallsForChat(chatId, deps);
    await deps.editMessageReplyMarkup(
      chatId,
      messageId,
      todayMenuKeyboard(subscribed, locale, halls),
    );
  } catch (err) {
    console.warn(
      `editMessageReplyMarkup failed: ${(err as Error).message}`,
    );
  }
}

async function sendLanguagePicker(
  chatId: number,
  deps: TelegramDeps,
): Promise<void> {
  await deps.sendMessage(chatId, LANGUAGE_PROMPT, {
    reply_markup: languagePickerKeyboard(),
  });
}

async function showLanguagePickerOnMessage(
  deps: TelegramDeps,
  chatId: number,
  messageId: number | undefined,
): Promise<void> {
  if (messageId != null && deps.editMessageReplyMarkup) {
    try {
      await deps.editMessageReplyMarkup(
        chatId,
        messageId,
        languagePickerKeyboard(),
      );
      return;
    } catch (err) {
      console.warn(
        `editMessageReplyMarkup language picker failed: ${(err as Error).message}`,
      );
    }
  }
  await sendLanguagePicker(chatId, deps);
}

async function sendTodayMenu(
  chatId: number,
  deps: TelegramDeps,
  logLabel: string,
  locale: Locale,
): Promise<void> {
  const copy = t(locale);
  try {
    const today = await deps.getTodayMenus();
    const halls = await hallsForChat(chatId, deps);
    const text = today.awaitingTodaysMenu
      ? copy.menuNotReady
      : formatMenuMessage(today.peony, today.azilea, { locale, halls });
    await deps.sendMessage(chatId, text, {
      reply_markup: await keyboardFor(chatId, deps, locale),
    });
  } catch (err) {
    console.error(`${logLabel} failed: ${(err as Error).message}`);
    await deps.sendMessage(chatId, copy.menuUnavailable, {
      reply_markup: await keyboardFor(chatId, deps, locale),
    });
  }
}

export type TelegramChatLike = {
  id?: number;
  type?: string;
};

type MessageUpdate = {
  update_id?: number;
  message?: {
    chat?: TelegramChatLike;
    text?: string;
  };
  callback_query?: {
    id?: string;
    data?: string;
    message?: { chat?: TelegramChatLike; message_id?: number };
    from?: { id?: number };
  };
};

/**
 * Student and admin handlers are DM-only. Missing `type` counts as private so
 * tests can omit it; Telegram always sends type on live updates.
 */
export function isPrivateTelegramChat(
  chat: TelegramChatLike | undefined,
): boolean {
  if (typeof chat?.id !== "number" || !Number.isFinite(chat.id)) return false;
  if (chat.type == null || chat.type === "") return true;
  return chat.type === "private";
}

/** Empty / whitespace `TELEGRAM_CHANNEL_CHAT_ID` means skip the channel post. */
export function readChannelChatId(
  envValue: string | undefined,
): string | undefined {
  const trimmed = envValue?.trim();
  return trimmed ? trimmed : undefined;
}

async function safeTrack(
  trackEvent: TrackEvent | undefined,
  eventName: Parameters<TrackEvent>[0],
  props?: Parameters<TrackEvent>[1],
): Promise<void> {
  if (!trackEvent) return;
  try {
    await trackEvent(eventName, props);
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
  description?: string;
};

export type ChannelClaimResult =
  | { claimed: false }
  | { claimed: true; claimToken: string; resumeComplete?: boolean };

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
  /** When set, used instead of the shared `menuText` after locale resolve. */
  menuTextForLocale?: (locale: Locale, halls?: HallPref) => string;
  /** Insert a ru prefs row when the chat has none. */
  ensureLocale?: (chatId: number) => Promise<string>;
  /** Missing / unknown halls means both. */
  getHalls?: (chatId: number) => Promise<string | null>;
  sendTimeoutMs?: number;
  /** Atomically claim this chat for today. When set, replaces lastPushedDate skip. */
  claimDelivery?: (chatId: number) => Promise<boolean>;
  /** Undo a claim after a failed / thrown send so a later retry can deliver. */
  releaseClaim?: (chatId: number) => Promise<void>;
  /** Clear the in-flight marker after a successful send. */
  completeDelivery?: (chatId: number) => Promise<void>;
  /** 12:30 KST last cron attempt: send even if one hall is still empty. */
  lastAttempt?: boolean;
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
      lastAttempt: args.lastAttempt,
    })
  ) {
    return summary;
  }

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
      let locale = DEFAULT_LOCALE;
      if (args.ensureLocale) {
        try {
          locale = parseLocale(await args.ensureLocale(subscriber.chatId));
        } catch (err) {
          console.error(
            `morning push ensureLocale ${subscriber.chatId} failed: ${(err as Error).message}`,
          );
        }
      }
      let halls = DEFAULT_HALL_PREF;
      if (args.getHalls) {
        try {
          halls = parseHallPref(await args.getHalls(subscriber.chatId));
        } catch (err) {
          console.error(
            `morning push getHalls ${subscriber.chatId} failed: ${(err as Error).message}`,
          );
        }
      }
      const text = args.menuTextForLocale?.(locale, halls) ?? args.menuText;
      const keyboard = todayMenuKeyboard(true, locale, halls);
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

export type ChannelPostOutcome =
  | "unset"
  | "skipped"
  | "sent"
  | "failed"
  | "blocked";

export type ChannelPostSummary = {
  outcome: ChannelPostOutcome;
};

/**
 * One channel message per weekday when the morning-push gate passes.
 * No inline keyboard — those callbacks would bind the channel chat id.
 * Unset TELEGRAM_CHANNEL_CHAT_ID is a no-op.
 */
function isAmbiguousSendTimeout(errOrResult: unknown): boolean {
  if (
    errOrResult != null &&
    typeof errOrResult === "object" &&
    "ok" in errOrResult
  ) {
    const result = errOrResult as MorningSendResult;
    return !result.ok && isTimeoutError({ message: result.description ?? "" });
  }
  return isTimeoutError(errOrResult);
}

export async function deliverChannelPost(args: {
  today: string;
  peony: StoredMenuLike;
  azilea: StoredMenuLike;
  channelChatId: string | undefined;
  menuText: string;
  send: (chatId: string, text: string) => Promise<MorningSendResult>;
  sendTimeoutMs?: number;
  lastPostedDate?: string;
  claimDelivery?: () => Promise<ChannelClaimResult>;
  confirmDelivery?: (claimToken: string) => Promise<void>;
  completeDelivery?: (claimToken: string) => Promise<void>;
  releaseClaim?: (claimToken: string) => Promise<void>;
  trackEvent?: TrackEvent;
  /** 12:30 KST last cron attempt: post even if one hall is still empty. */
  lastAttempt?: boolean;
}): Promise<ChannelPostSummary> {
  const channelChatId = readChannelChatId(args.channelChatId);
  if (!channelChatId) {
    return { outcome: "unset" };
  }
  if (
    !shouldSendMorningPush({
      today: args.today,
      peony: args.peony,
      azilea: args.azilea,
      lastAttempt: args.lastAttempt,
    })
  ) {
    return { outcome: "skipped" };
  }

  let claimToken: string | undefined;
  const releaseIfNeeded = async () => {
    if (!args.releaseClaim || claimToken == null) return;
    try {
      await args.releaseClaim(claimToken);
    } catch (err) {
      console.error(
        `channel post release failed: ${(err as Error).message}`,
      );
    }
  };
  const confirmBestEffort = async () => {
    if (!args.confirmDelivery || claimToken == null) return;
    try {
      await args.confirmDelivery(claimToken);
    } catch (err) {
      console.error(
        `channel post confirm failed: ${(err as Error).message}`,
      );
      try {
        await args.confirmDelivery(claimToken);
      } catch (retryErr) {
        console.error(
          `channel post confirm retry failed: ${(retryErr as Error).message}`,
        );
      }
    }
  };
  const completeBestEffort = async () => {
    if (!args.completeDelivery || claimToken == null) return;
    await args.completeDelivery(claimToken);
  };

  if (args.claimDelivery) {
    let claim: ChannelClaimResult = { claimed: false };
    try {
      claim = await args.claimDelivery();
    } catch (err) {
      console.error(`channel post claim failed: ${(err as Error).message}`);
      return { outcome: "failed" };
    }
    if (!claim.claimed) return { outcome: "skipped" };
    claimToken = claim.claimToken;
    if (claim.resumeComplete) {
      try {
        await completeBestEffort();
      } catch (err) {
        console.error(
          `channel post complete retry failed: ${(err as Error).message}`,
        );
      }
      return { outcome: "skipped" };
    }
  } else if (args.lastPostedDate === args.today) {
    return { outcome: "skipped" };
  }

  const sendTimeoutMs = args.sendTimeoutMs ?? TELEGRAM_SEND_TIMEOUT_MS;
  let sendSucceeded = false;
  try {
    const result = await withTimeout(
      args.send(channelChatId, args.menuText),
      sendTimeoutMs,
      `channel post timed out after ${sendTimeoutMs}ms`,
    );
    if (result.blocked) {
      await releaseIfNeeded();
      return { outcome: "blocked" };
    }
    if (!result.ok) {
      if (isAmbiguousSendTimeout(result)) {
        await confirmBestEffort();
        return { outcome: "failed" };
      }
      await releaseIfNeeded();
      return { outcome: "failed" };
    }
    sendSucceeded = true;
    await confirmBestEffort();
    try {
      await completeBestEffort();
    } catch (err) {
      console.error(
        `channel post complete failed: ${(err as Error).message}`,
      );
    }
    await safeTrack(args.trackEvent, EVENT_CHANNEL_POST, { date: args.today });
    return { outcome: "sent" };
  } catch (err) {
    console.error(`channel post failed: ${(err as Error).message}`);
    if (sendSucceeded || isAmbiguousSendTimeout(err)) {
      await confirmBestEffort();
      if (sendSucceeded) {
        try {
          await completeBestEffort();
        } catch (completeErr) {
          console.error(
            `channel post complete failed: ${(completeErr as Error).message}`,
          );
        }
        await safeTrack(args.trackEvent, EVENT_CHANNEL_POST, {
          date: args.today,
        });
        return { outcome: "sent" };
      }
      return { outcome: "failed" };
    }
    await releaseIfNeeded();
    return { outcome: "failed" };
  }
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
    const locale = await localeOrEnsure(chatId, deps);
    const menuText =
      result.peony !== undefined || result.azilea !== undefined
        ? formatMenuMessage(result.peony ?? null, result.azilea ?? null, {
            locale,
            halls: await hallsForChat(chatId, deps),
          })
        : result.telegramMessage;
    await deps.sendMessage(chatId, menuText);
  } catch (err) {
    console.error(`/refetch failed: ${(err as Error).message}`);
    await deps.sendMessage(chatId, `Refetch failed: ${(err as Error).message}`);
  }
}

/**
 * Stateless Telegram bot logic:
 * - first student DM with no locale → language picker
 * - after a locale is stored, any student DM → today's menus + keyboard
 *   (or «меню ещё не выложили» when a weekday fetch is still pending)
 * - group / supergroup / channel inbound updates are ignored
 * - ADMIN_CHAT_ID only: /status, /refetch, /stats
 * - callback "today_menu" → same menu (refresh, including stub trays;
 *   weekday empty-DB before cutoff sends «меню ещё не выложили» instead)
 * - callback morning_subscribe / morning_unsubscribe → toast + flip keyboard
 * - callback hall_peony / hall_azilea → toast + resend filtered menu
 * - callback change_language → locale picker on that message
 * - callback locale_ru / locale_en → store locale and resend the menu
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

    const messageId = callbackMessageId(callback.message);

    if (
      !isPrivateTelegramChat({
        id: chatId,
        type: callback.message?.chat?.type,
      })
    ) {
      try {
        await deps.answerCallbackQuery(callbackId);
      } catch (err) {
        console.warn(
          `answerCallbackQuery ignored-chat failed: ${(err as Error).message}`,
        );
      }
      return "ignored";
    }

    const picked = localeFromCallback(callback.data);
    if (picked) {
      try {
        if (deps.setLocale) await deps.setLocale(chatId, picked);
      } catch (err) {
        console.error(`setLocale failed: ${(err as Error).message}`);
      }
      try {
        await deps.answerCallbackQuery(callbackId);
      } catch (err) {
        console.warn(
          `locale pick ack failed: ${(err as Error).message}`,
        );
      }
      await sendTodayMenu(chatId, deps, "locale menu", picked);
      return "ok";
    }

    if (callback.data === CHANGE_LANGUAGE_CALLBACK) {
      try {
        await deps.answerCallbackQuery(callbackId);
      } catch (err) {
        console.warn(
          `answerCallbackQuery change_language failed: ${(err as Error).message}`,
        );
      }
      await showLanguagePickerOnMessage(deps, chatId, messageId);
      return "ok";
    }

    const locale = await localeForChat(chatId, deps);
    if (locale == null) {
      try {
        await deps.answerCallbackQuery(callbackId);
      } catch (err) {
        console.warn(
          `answerCallbackQuery picker failed: ${(err as Error).message}`,
        );
      }
      await sendLanguagePicker(chatId, deps);
      return "ok";
    }

    const copy = t(locale);

    if (callback.data === SUBSCRIBE_CALLBACK) {
      try {
        if (deps.subscribe) await deps.subscribe(chatId);
        await toastMorningToggle(deps, callbackId, copy.subscribed);
        await flipMorningKeyboard(deps, chatId, messageId, true, locale);
      } catch (err) {
        console.error(`morning_subscribe failed: ${(err as Error).message}`);
        await toastMorningToggle(deps, callbackId, copy.subscribeFailed);
      }
      return "ok";
    }

    if (callback.data === UNSUBSCRIBE_CALLBACK) {
      try {
        if (deps.unsubscribe) await deps.unsubscribe(chatId);
        await toastMorningToggle(deps, callbackId, copy.unsubscribed);
        await flipMorningKeyboard(deps, chatId, messageId, false, locale);
      } catch (err) {
        console.error(`morning_unsubscribe failed: ${(err as Error).message}`);
        await toastMorningToggle(deps, callbackId, copy.unsubscribeFailed);
      }
      return "ok";
    }

    const hallTap = hallFromCallback(callback.data);
    if (hallTap) {
      const current = await hallsForChat(chatId, deps);
      const { pref, changed } = toggleHall(current, hallTap);
      if (!changed) {
        await toastMorningToggle(deps, callbackId, copy.hallsNeedOne);
        return "ok";
      }
      try {
        if (deps.setHalls) await deps.setHalls(chatId, pref);
        await toastMorningToggle(deps, callbackId, hallsToast(copy, pref));
        await sendTodayMenu(chatId, deps, "hall menu", locale);
      } catch (err) {
        console.error(`setHalls failed: ${(err as Error).message}`);
        await toastMorningToggle(deps, callbackId, copy.hallsFailed);
      }
      return "ok";
    }

    await deps.answerCallbackQuery(callbackId);

    if (callback.data !== TODAY_MENU_CALLBACK) {
      return "ok";
    }

    await safeTrack(deps.trackEvent, EVENT_TODAY_MENU);
    await sendTodayMenu(chatId, deps, "today_menu handler", locale);
    return "ok";
  }

  const chatId = u.message?.chat?.id;
  if (typeof chatId !== "number") {
    return "ignored";
  }
  if (!isPrivateTelegramChat(u.message?.chat)) {
    return "ignored";
  }

  const command = parseAdminCommand(u.message?.text);
  if (command && isAdminChat(chatId, deps.adminChatId)) {
    await handleAdminCommand(command, chatId, deps, telegramUpdateId(u));
    return "ok";
  }

  const locale = await localeForChat(chatId, deps);
  if (locale == null) {
    await sendLanguagePicker(chatId, deps);
    await safeTrack(deps.trackEvent, EVENT_START);
    return "ok";
  }

  await sendTodayMenu(chatId, deps, "start menu", locale);
  await safeTrack(deps.trackEvent, EVENT_START);
  return "ok";
}
