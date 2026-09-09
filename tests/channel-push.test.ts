import { describe, expect, it, vi } from "vitest";
import {
  deliverChannelPost,
  isPrivateTelegramChat,
  processTelegramUpdate,
  readChannelChatId,
} from "../convex/telegramHandlers";
import { EVENT_CHANNEL_POST } from "../convex/analytics";

const tray = {
  source: "live" as const,
  dishes: [
    { name: "눈꽃치즈닭갈비덮밥" },
    { name: "미역국" },
    { name: "피자고로케&케찹" },
    { name: "어묵채볶음" },
    { name: "숙주나물" },
  ],
  fetchedAt: 1,
};

const noInfo = {
  source: "no_info" as const,
  dishes: [],
  fetchedAt: 1,
};

const monday = "2026-09-07";
const CHANNEL = "-1001234567890";

function createChannelClaimStore() {
  let row: { lastPostedDate?: string; claimedAt?: number } | undefined;
  return {
    snapshot() {
      return row ? { ...row } : undefined;
    },
    async claim(date: string, nowMs: number, staleAfterMs = 60_000) {
      if (row?.lastPostedDate === date) {
        if (row.claimedAt == null) return false;
        if (nowMs - row.claimedAt < staleAfterMs) return false;
      }
      row = { lastPostedDate: date, claimedAt: nowMs };
      return true;
    },
    async complete(date: string) {
      if (!row || row.lastPostedDate !== date) return;
      delete row.claimedAt;
    },
    async release(date: string) {
      if (!row || row.lastPostedDate !== date || row.claimedAt == null) return;
      row = {};
    },
  };
}

function baseArgs(store: ReturnType<typeof createChannelClaimStore>, nowMs: number) {
  return {
    today: monday,
    peony: tray,
    azilea: noInfo,
    channelChatId: CHANNEL,
    menuText: "menu",
    sendTimeoutMs: 5_000,
    claimDelivery: () => store.claim(monday, nowMs),
    completeDelivery: () => store.complete(monday),
    releaseClaim: () => store.release(monday),
  };
}

describe("readChannelChatId", () => {
  it("treats missing and blank values as unset", () => {
    expect(readChannelChatId(undefined)).toBeUndefined();
    expect(readChannelChatId("")).toBeUndefined();
    expect(readChannelChatId("   ")).toBeUndefined();
  });

  it("keeps numeric ids and @usernames", () => {
    expect(readChannelChatId(" -100123 ")).toBe("-100123");
    expect(readChannelChatId("@daily_menu_dev")).toBe("@daily_menu_dev");
  });
});

describe("isPrivateTelegramChat", () => {
  it("accepts private chats and tests that omit type", () => {
    expect(isPrivateTelegramChat({ id: 42, type: "private" })).toBe(true);
    expect(isPrivateTelegramChat({ id: 42 })).toBe(true);
  });

  it("rejects groups, supergroups, and channels", () => {
    expect(isPrivateTelegramChat({ id: -10, type: "group" })).toBe(false);
    expect(isPrivateTelegramChat({ id: -100, type: "supergroup" })).toBe(false);
    expect(isPrivateTelegramChat({ id: -1001, type: "channel" })).toBe(false);
  });

  it("rejects missing chat ids", () => {
    expect(isPrivateTelegramChat(undefined)).toBe(false);
    expect(isPrivateTelegramChat({ type: "private" })).toBe(false);
  });
});

describe("deliverChannelPost", () => {
  it("is a no-op when TELEGRAM_CHANNEL_CHAT_ID is unset", async () => {
    const send = vi.fn(async () => ({ ok: true }));
    const summary = await deliverChannelPost({
      today: monday,
      peony: tray,
      azilea: noInfo,
      channelChatId: undefined,
      menuText: "menu",
      send,
    });
    expect(summary.outcome).toBe("unset");
    expect(send).not.toHaveBeenCalled();
  });

  it("skips weekends and non-food trays", async () => {
    const send = vi.fn(async () => ({ ok: true }));
    const sunday = await deliverChannelPost({
      today: "2026-09-06",
      peony: tray,
      azilea: noInfo,
      channelChatId: CHANNEL,
      menuText: "menu",
      send,
    });
    expect(sunday.outcome).toBe("skipped");

    const closed = await deliverChannelPost({
      today: monday,
      peony: { source: "holiday", dishes: [{ name: "휴무" }], fetchedAt: 1 },
      azilea: noInfo,
      channelChatId: CHANNEL,
      menuText: "closed",
      send,
    });
    expect(closed.outcome).toBe("skipped");
    expect(send).not.toHaveBeenCalled();
  });

  it("posts once without an inline keyboard", async () => {
    const store = createChannelClaimStore();
    const nowMs = 1_700_000_000_000;
    const send = vi.fn(async (chatId: string, text: string) => {
      expect(chatId).toBe(CHANNEL);
      expect(text).toBe("menu");
      return { ok: true };
    });
    const tracked: Array<{ name: string; date?: string }> = [];

    const first = await deliverChannelPost({
      ...baseArgs(store, nowMs),
      send,
      trackEvent: async (name, props) => {
        tracked.push({ name, date: props?.date });
      },
    });
    expect(first.outcome).toBe("sent");
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0]?.length).toBe(2);
    expect(tracked).toEqual([{ name: EVENT_CHANNEL_POST, date: monday }]);
    expect(store.snapshot()).toEqual({ lastPostedDate: monday });

    const second = await deliverChannelPost({
      ...baseArgs(store, nowMs),
      send,
    });
    expect(second.outcome).toBe("skipped");
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("skips by lastPostedDate when claim callbacks are omitted", async () => {
    const send = vi.fn(async () => ({ ok: true }));
    const summary = await deliverChannelPost({
      today: monday,
      peony: tray,
      azilea: noInfo,
      channelChatId: CHANNEL,
      menuText: "menu",
      lastPostedDate: monday,
      send,
    });
    expect(summary.outcome).toBe("skipped");
    expect(send).not.toHaveBeenCalled();
  });

  it("releases a failed send so a later retry can post", async () => {
    const store = createChannelClaimStore();
    const nowMs = 1_700_000_000_000;
    const failed = await deliverChannelPost({
      ...baseArgs(store, nowMs),
      send: async () => ({ ok: false }),
    });
    expect(failed.outcome).toBe("failed");
    expect(store.snapshot()).toEqual({});

    const retried = await deliverChannelPost({
      ...baseArgs(store, nowMs),
      send: async () => ({ ok: true }),
    });
    expect(retried.outcome).toBe("sent");
    expect(store.snapshot()).toEqual({ lastPostedDate: monday });
  });

  it("releases a blocked channel so a later retry can post", async () => {
    const store = createChannelClaimStore();
    const nowMs = 1_700_000_000_000;
    const blocked = await deliverChannelPost({
      ...baseArgs(store, nowMs),
      send: async () => ({ ok: false, blocked: true }),
    });
    expect(blocked.outcome).toBe("blocked");
    expect(store.snapshot()).toEqual({});
  });
});

describe("processTelegramUpdate ignores non-private chats", () => {
  const deps = {
    getTodayMenus: async () => {
      throw new Error("should not load menus for a group");
    },
    sendMessage: async () => {
      throw new Error("should not reply in a group");
    },
    answerCallbackQuery: async () => undefined,
    subscribe: async () => {
      throw new Error("should not subscribe a group chat id");
    },
  };

  it("ignores group, supergroup, and channel messages", async () => {
    expect(
      await processTelegramUpdate(
        { message: { chat: { id: -10, type: "group" }, text: "/start" } },
        deps,
      ),
    ).toBe("ignored");
    expect(
      await processTelegramUpdate(
        { message: { chat: { id: -100, type: "supergroup" }, text: "hi" } },
        deps,
      ),
    ).toBe("ignored");
    expect(
      await processTelegramUpdate(
        { message: { chat: { id: -1001, type: "channel" }, text: "post" } },
        deps,
      ),
    ).toBe("ignored");
  });

  it("answers a group callback then ignores it", async () => {
    const answered: string[] = [];
    expect(
      await processTelegramUpdate(
        {
          callback_query: {
            id: "cb-g",
            data: "morning_subscribe",
            message: { chat: { id: -100, type: "supergroup" } },
          },
        },
        {
          ...deps,
          answerCallbackQuery: async (id) => {
            answered.push(id);
          },
        },
      ),
    ).toBe("ignored");
    expect(answered).toEqual(["cb-g"]);
  });
});
