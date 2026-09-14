import { describe, expect, it, vi } from "vitest";
import {
  deliverChannelPost,
  isPrivateTelegramChat,
  processTelegramUpdate,
  readChannelChatId,
} from "../convex/telegramHandlers";
import { EVENT_CHANNEL_POST } from "../convex/analytics";
import {
  decideClaimChannelPush,
  ownsChannelClaim,
  type ChannelPushClaimRow,
} from "../convex/channelPushPolicy";

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
  let row: ChannelPushClaimRow | undefined;
  let tokenSeq = 0;
  return {
    snapshot(): ChannelPushClaimRow | undefined {
      return row ? { ...row } : undefined;
    },
    async claim(date: string, nowMs: number, staleAfterMs = 60_000) {
      const decision = decideClaimChannelPush(row ?? {}, {
        date,
        nowMs,
        staleAfterMs,
      });
      if (!decision.claimed) return { claimed: false as const };
      if (decision.resumeComplete) {
        return {
          claimed: true as const,
          claimToken: decision.claimToken,
          resumeComplete: true as const,
        };
      }
      const claimToken = `tok-${++tokenSeq}`;
      row = {
        lastPostedDate: decision.lastPostedDate,
        claimedAt: decision.claimedAt,
        claimToken,
      };
      return { claimed: true as const, claimToken, resumeComplete: false as const };
    },
    async confirm(date: string, claimToken: string) {
      if (!ownsChannelClaim(row, { date, claimToken })) return;
      row = { ...row, sendConfirmed: true };
    },
    async complete(date: string, claimToken: string) {
      if (!ownsChannelClaim(row, { date, claimToken })) return;
      row = { lastPostedDate: date, sendConfirmed: true };
    },
    async release(date: string, claimToken: string) {
      if (
        !ownsChannelClaim(row, { date, claimToken }) ||
        row.claimedAt == null ||
        row.sendConfirmed
      ) {
        return;
      }
      row = {};
    },
  };
}

function baseArgs(store: ReturnType<typeof createChannelClaimStore>, nowMs: number) {
  return {
    today: monday,
    peony: tray,
    azilea: tray,
    channelChatId: CHANNEL,
    menuText: "menu",
    sendTimeoutMs: 5_000,
    claimDelivery: () => store.claim(monday, nowMs),
    confirmDelivery: (token: string) => store.confirm(monday, token),
    completeDelivery: (token: string) => store.complete(monday, token),
    releaseClaim: (token: string) => store.release(monday, token),
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
      azilea: tray,
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
    expect(store.snapshot()).toEqual({
      lastPostedDate: monday,
      sendConfirmed: true,
    });

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
      azilea: tray,
      channelChatId: CHANNEL,
      menuText: "menu",
      lastPostedDate: monday,
      send,
    });
    expect(summary.outcome).toBe("skipped");
    expect(send).not.toHaveBeenCalled();
  });

  it("waits while either hall is still a stub", async () => {
    const send = vi.fn(async () => ({ ok: true }));
    const summary = await deliverChannelPost({
      today: monday,
      peony: tray,
      azilea: {
        source: "live",
        dishes: [{ name: "오므라이스" }],
        fetchedAt: 1,
      },
      channelChatId: CHANNEL,
      menuText: "partial",
      send,
    });
    expect(summary.outcome).toBe("skipped");
    expect(send).not.toHaveBeenCalled();
  });

  it("posts on the last attempt even if one hall is empty", async () => {
    const send = vi.fn(async () => ({ ok: true }));
    const summary = await deliverChannelPost({
      today: monday,
      peony: tray,
      azilea: noInfo,
      lastAttempt: true,
      channelChatId: CHANNEL,
      menuText: "last try",
      send,
    });
    expect(summary.outcome).toBe("sent");
    expect(send).toHaveBeenCalledTimes(1);
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
    expect(store.snapshot()).toEqual({
      lastPostedDate: monday,
      sendConfirmed: true,
    });
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

  it("does not release an ambiguous send timeout or allow a later resend", async () => {
    const store = createChannelClaimStore();
    const nowMs = 1_700_000_000_000;
    const hung = await deliverChannelPost({
      ...baseArgs(store, nowMs),
      sendTimeoutMs: 20,
      send: async () => new Promise(() => {}),
    });
    expect(hung.outcome).toBe("failed");
    expect(store.snapshot()).toEqual({
      lastPostedDate: monday,
      claimedAt: nowMs,
      claimToken: "tok-1",
      sendConfirmed: true,
    });

    const send = vi.fn(async () => ({ ok: true }));
    const later = await deliverChannelPost({
      ...baseArgs(store, nowMs + 120_000),
      send,
    });
    expect(send).not.toHaveBeenCalled();
    expect(later.outcome).toBe("skipped");
    expect(store.snapshot()).toEqual({
      lastPostedDate: monday,
      sendConfirmed: true,
    });
  });

  it("does not release a result-object send timeout", async () => {
    const store = createChannelClaimStore();
    const nowMs = 1_700_000_000_000;
    const timedOut = await deliverChannelPost({
      ...baseArgs(store, nowMs),
      send: async () => ({
        ok: false,
        description: "Telegram sendMessage timed out after 8000ms",
      }),
    });
    expect(timedOut.outcome).toBe("failed");
    expect(store.snapshot()?.lastPostedDate).toBe(monday);
    expect(store.snapshot()?.sendConfirmed).toBe(true);
    expect(store.snapshot()?.claimedAt).toBe(nowMs);

    const send = vi.fn(async () => ({ ok: true }));
    const later = await deliverChannelPost({
      ...baseArgs(store, nowMs + 120_000),
      send,
    });
    expect(send).not.toHaveBeenCalled();
    expect(later.outcome).toBe("skipped");
  });

  it("retries complete after a confirmed send without sending again", async () => {
    const store = createChannelClaimStore();
    const nowMs = 1_700_000_000_000;
    const send = vi.fn(async () => ({ ok: true }));
    let completeCalls = 0;
    const first = await deliverChannelPost({
      ...baseArgs(store, nowMs),
      send,
      completeDelivery: async (token) => {
        completeCalls += 1;
        if (completeCalls === 1) throw new Error("complete rejected");
        await store.complete(monday, token);
      },
    });
    expect(first.outcome).toBe("sent");
    expect(send).toHaveBeenCalledTimes(1);
    expect(completeCalls).toBe(1);
    expect(store.snapshot()).toEqual({
      lastPostedDate: monday,
      claimedAt: nowMs,
      claimToken: "tok-1",
      sendConfirmed: true,
    });

    const second = await deliverChannelPost({
      ...baseArgs(store, nowMs + 120_000),
      send,
      completeDelivery: async (token) => {
        completeCalls += 1;
        await store.complete(monday, token);
      },
    });
    expect(send).toHaveBeenCalledTimes(1);
    expect(completeCalls).toBe(2);
    expect(second.outcome).toBe("skipped");
    expect(store.snapshot()).toEqual({
      lastPostedDate: monday,
      sendConfirmed: true,
    });
  });

  it("does not let a stale claim release a newer claim", async () => {
    const store = createChannelClaimStore();
    const nowMs = 1_700_000_000_000;
    let resolveFirstSend!: (value: { ok: boolean }) => void;
    const firstSend = new Promise<{ ok: boolean }>((resolve) => {
      resolveFirstSend = resolve;
    });
    let firstClaimed!: () => void;
    const firstHasClaimed = new Promise<void>((resolve) => {
      firstClaimed = resolve;
    });

    const first = deliverChannelPost({
      ...baseArgs(store, nowMs),
      sendTimeoutMs: 30_000,
      claimDelivery: async () => {
        const result = await store.claim(monday, nowMs);
        firstClaimed();
        return result;
      },
      send: async () => firstSend,
    });
    await firstHasClaimed;

    const secondSend = vi.fn(async () => ({ ok: true }));
    const second = await deliverChannelPost({
      ...baseArgs(store, nowMs + 120_000),
      send: secondSend,
    });
    expect(second.outcome).toBe("sent");
    expect(secondSend).toHaveBeenCalledTimes(1);
    expect(store.snapshot()).toEqual({
      lastPostedDate: monday,
      sendConfirmed: true,
    });

    resolveFirstSend({ ok: false });
    const firstResult = await first;
    expect(firstResult.outcome).toBe("failed");
    expect(store.snapshot()).toEqual({
      lastPostedDate: monday,
      sendConfirmed: true,
    });
  });
});

describe("decideClaimChannelPush", () => {
  const nowMs = 1_700_000_000_000;
  const staleAfterMs = 60_000;

  it("refuses to reclaim a confirmed post even after the claim is stale", () => {
    expect(
      decideClaimChannelPush(
        {
          lastPostedDate: monday,
          claimedAt: nowMs - staleAfterMs - 1,
          claimToken: "old",
          sendConfirmed: true,
        },
        { date: monday, nowMs, staleAfterMs },
      ),
    ).toEqual({
      claimed: true,
      resumeComplete: true,
      lastPostedDate: monday,
      claimedAt: nowMs - staleAfterMs - 1,
      claimToken: "old",
    });
  });

  it("reclaims a stale unconfirmed claim for a new send", () => {
    expect(
      decideClaimChannelPush(
        {
          lastPostedDate: monday,
          claimedAt: nowMs - staleAfterMs - 1,
          claimToken: "old",
        },
        { date: monday, nowMs, staleAfterMs },
      ),
    ).toEqual({
      claimed: true,
      lastPostedDate: monday,
      claimedAt: nowMs,
    });
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
