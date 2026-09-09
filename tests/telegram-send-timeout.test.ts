import { afterEach, describe, expect, it, vi } from "vitest";
import { withTimeout } from "../convex/asyncTimeout";
import {
  TELEGRAM_SEND_TIMEOUT_MS,
  sendMessageResult,
} from "../convex/telegramClient";
import { deliverMorningPushes } from "../convex/telegramHandlers";

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

describe("telegram send timeout", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("withTimeout rejects a promise that never settles", async () => {
    await expect(
      withTimeout(new Promise(() => {}), 20, "sender timed out"),
    ).rejects.toThrow(/timed out/);
  });

  it("continues morning-push delivery when the first send never resolves", async () => {
    const attempted: number[] = [];
    const marked: number[] = [];
    const sendTimeoutMs = 40;
    const started = Date.now();
    const summary = await deliverMorningPushes({
      today: monday,
      peony: tray,
      azilea: noInfo,
      menuText: "menu",
      sendTimeoutMs,
      subscribers: [{ chatId: 1 }, { chatId: 2 }],
      send: async (chatId) => {
        attempted.push(chatId);
        if (chatId === 1) {
          return new Promise(() => {});
        }
        return { ok: true };
      },
      markPushed: async (chatId) => {
        marked.push(chatId);
      },
      dropSubscriber: async () => undefined,
    });
    const elapsed = Date.now() - started;
    expect(attempted).toEqual([1, 2]);
    expect(marked).toEqual([2]);
    expect(summary).toEqual({ sent: 1, failed: 1, skipped: 0, dropped: 0 });
    expect(elapsed).toBeLessThan(1_000);
  }, 2_000);

  it("sendMessageResult returns failure instead of hanging when fetch never resolves", async () => {
    vi.useFakeTimers();
    const prevToken = process.env.TELEGRAM_BOT_TOKEN;
    process.env.TELEGRAM_BOT_TOKEN = "test-token";
    vi.stubGlobal(
      "fetch",
      ((_url: string, init?: RequestInit) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(
              new DOMException(
                "The operation was aborted due to timeout",
                "TimeoutError",
              ),
            );
          });
        })) as typeof fetch,
    );

    try {
      const pending = sendMessageResult(99, "menu");
      await vi.advanceTimersByTimeAsync(TELEGRAM_SEND_TIMEOUT_MS);
      const result = await pending;
      expect(result.ok).toBe(false);
      expect(result.description).toMatch(/timed out/);
    } finally {
      if (prevToken === undefined) delete process.env.TELEGRAM_BOT_TOKEN;
      else process.env.TELEGRAM_BOT_TOKEN = prevToken;
    }
  });
});
