import { describe, expect, it } from "vitest";
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

const monday = "2026-09-07";
const STALE_AFTER_MS = 60_000;

type ClaimRow = { lastPushedDate?: string; pushClaimedAt?: number };

/** In-memory stand-in for Convex OCC around claimPush / completePush / releasePushClaim. */
function createPushClaimStore() {
  const rows = new Map<number, ClaimRow>();
  let tail = Promise.resolve();

  function exclusive<T>(fn: () => T): Promise<T> {
    const run = tail.then(fn);
    tail = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  return {
    seed(chatId: number, row: ClaimRow) {
      rows.set(chatId, { ...row });
    },
    snapshot(chatId: number): ClaimRow | undefined {
      const row = rows.get(chatId);
      return row ? { ...row } : undefined;
    },
    claim(chatId: number, date: string, nowMs: number, staleAfterMs = STALE_AFTER_MS) {
      return exclusive(() => {
        const row = rows.get(chatId);
        if (row == null) return false;
        if (row.lastPushedDate === date) {
          if (row.pushClaimedAt == null) return false;
          if (nowMs - row.pushClaimedAt < staleAfterMs) return false;
        }
        row.lastPushedDate = date;
        row.pushClaimedAt = nowMs;
        return true;
      });
    },
    complete(chatId: number, date: string) {
      return exclusive(() => {
        const row = rows.get(chatId);
        if (!row || row.lastPushedDate !== date) return;
        delete row.pushClaimedAt;
      });
    },
    release(chatId: number, date: string) {
      return exclusive(() => {
        const row = rows.get(chatId);
        if (!row || row.lastPushedDate !== date || row.pushClaimedAt == null) {
          return;
        }
        delete row.lastPushedDate;
        delete row.pushClaimedAt;
      });
    },
  };
}

function baseArgs(store: ReturnType<typeof createPushClaimStore>, nowMs: number) {
  return {
    today: monday,
    peony: tray,
    azilea: tray,
    menuText: "menu",
    sendTimeoutMs: 5_000,
    claimDelivery: (chatId: number) => store.claim(chatId, monday, nowMs),
    completeDelivery: (chatId: number) => store.complete(chatId, monday),
    releaseClaim: (chatId: number) => store.release(chatId, monday),
    markPushed: async () => undefined,
    dropSubscriber: async () => undefined,
  };
}

describe("morning push claim protocol", () => {
  it("sends exactly once when two deliverMorningPushes overlap for the same chat", async () => {
    const store = createPushClaimStore();
    store.seed(42, {});
    const nowMs = 1_700_000_000_000;
    const sendCalls: number[] = [];
    let claimAttempts = 0;
    let bothClaimsTried!: () => void;
    const bothClaims = new Promise<void>((resolve) => {
      bothClaimsTried = resolve;
    });

    const args = {
      ...baseArgs(store, nowMs),
      subscribers: [{ chatId: 42 }],
      claimDelivery: async (chatId: number) => {
        const claimed = await store.claim(chatId, monday, nowMs);
        claimAttempts += 1;
        if (claimAttempts >= 2) bothClaimsTried();
        return claimed;
      },
      send: async (chatId: number) => {
        sendCalls.push(chatId);
        await bothClaims;
        return { ok: true };
      },
    };

    const [first, second] = await Promise.all([
      deliverMorningPushes(args),
      deliverMorningPushes(args),
    ]);

    expect(sendCalls).toEqual([42]);
    expect(claimAttempts).toBe(2);
    expect(first.sent + second.sent).toBe(1);
    expect(first.skipped + second.skipped).toBe(1);
    expect(first.failed + second.failed).toBe(0);
    expect(store.snapshot(42)).toEqual({ lastPushedDate: monday });
  });

  it("reclaims a stale interrupted claim and then sends", async () => {
    const store = createPushClaimStore();
    const nowMs = 1_700_000_000_000;
    store.seed(7, {
      lastPushedDate: monday,
      pushClaimedAt: nowMs - STALE_AFTER_MS - 1,
    });
    const sendCalls: number[] = [];

    const summary = await deliverMorningPushes({
      ...baseArgs(store, nowMs),
      subscribers: [{ chatId: 7, lastPushedDate: monday }],
      send: async (chatId) => {
        sendCalls.push(chatId);
        return { ok: true };
      },
    });

    expect(sendCalls).toEqual([7]);
    expect(summary).toEqual({ sent: 1, failed: 0, skipped: 0, dropped: 0 });
    expect(store.snapshot(7)).toEqual({ lastPushedDate: monday });
  });

  it("does not send while a recent claim is still in flight", async () => {
    const store = createPushClaimStore();
    const nowMs = 1_700_000_000_000;
    store.seed(7, {
      lastPushedDate: monday,
      pushClaimedAt: nowMs - 1_000,
    });
    const sendCalls: number[] = [];

    const summary = await deliverMorningPushes({
      ...baseArgs(store, nowMs),
      subscribers: [{ chatId: 7, lastPushedDate: monday }],
      send: async (chatId) => {
        sendCalls.push(chatId);
        return { ok: true };
      },
    });

    expect(sendCalls).toEqual([]);
    expect(summary.skipped).toBe(1);
    expect(summary.sent).toBe(0);
    expect(store.snapshot(7)).toEqual({
      lastPushedDate: monday,
      pushClaimedAt: nowMs - 1_000,
    });
  });

  it("releases a failed send so a later retry can deliver", async () => {
    const store = createPushClaimStore();
    store.seed(3, {});
    const nowMs = 1_700_000_000_000;
    const sendCalls: number[] = [];

    const failed = await deliverMorningPushes({
      ...baseArgs(store, nowMs),
      subscribers: [{ chatId: 3 }],
      send: async (chatId) => {
        sendCalls.push(chatId);
        return { ok: false };
      },
    });
    expect(failed.failed).toBe(1);
    expect(store.snapshot(3)).toEqual({});

    const retried = await deliverMorningPushes({
      ...baseArgs(store, nowMs),
      subscribers: [{ chatId: 3 }],
      send: async (chatId) => {
        sendCalls.push(chatId);
        return { ok: true };
      },
    });
    expect(sendCalls).toEqual([3, 3]);
    expect(retried.sent).toBe(1);
    expect(store.snapshot(3)).toEqual({ lastPushedDate: monday });
  });
});
