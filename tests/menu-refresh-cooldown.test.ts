import { afterEach, describe, expect, it, vi } from "vitest";
import { requestStaleRefreshForToday } from "../convex/menus";
import type { MutationCtx } from "../convex/_generated/server";

const requestRefresh = (
  requestStaleRefreshForToday as unknown as {
    _handler: (
      ctx: MutationCtx,
      args: Record<string, never>,
    ) => Promise<boolean>;
  }
)._handler;
const now = Date.parse("2026-11-13T04:00:00Z");
const tray = {
  source: "live",
  dishes: Array.from({ length: 5 }, () => ({ name: "쌀밥" })),
  fetchedAt: now,
};

function context(options: { configured?: boolean; complete?: boolean } = {}) {
  const config =
    options.configured === false
      ? null
      : {
          _id: "config",
          studentRefreshRequestedAt: undefined as number | undefined,
        };
  const runAfter = vi.fn(async () => "scheduled");
  const patch = vi.fn(
    async (_id: unknown, fields: { studentRefreshRequestedAt: number }) => {
      Object.assign(config!, fields);
    },
  );
  const ctx = {
    db: {
      query: (table: string) => ({
        withIndex: () => ({
          unique: async () => config,
          take: async () =>
            options.complete
              ? [
                  { ...tray, cafeteria: "peony" },
                  { ...tray, cafeteria: "azilea" },
                ]
              : [],
        }),
      }),
      patch,
    },
    scheduler: { runAfter },
  } as unknown as MutationCtx;
  return { ctx, runAfter, patch };
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("background menu refresh cooldown", () => {
  it("queues once for repeated taps, then permits another attempt after five minutes", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    const { ctx, runAfter, patch } = context();
    expect(await requestRefresh(ctx, {})).toBe(true);
    expect(await requestRefresh(ctx, {})).toBe(false);
    vi.setSystemTime(now + 299_999);
    expect(await requestRefresh(ctx, {})).toBe(false);
    expect(runAfter).toHaveBeenCalledTimes(1);
    expect(runAfter).toHaveBeenCalledWith(0, expect.anything(), {});
    expect(patch).toHaveBeenCalledWith("config", {
      studentRefreshRequestedAt: now,
    });
    vi.setSystemTime(now + 300_000);
    expect(await requestRefresh(ctx, {})).toBe(true);
    expect(runAfter).toHaveBeenCalledTimes(2);
  });

  it("does not queue a scrape when there are already two complete menus", async () => {
    const { ctx, runAfter, patch } = context({ complete: true });
    expect(await requestRefresh(ctx, {})).toBe(false);
    expect(runAfter).not.toHaveBeenCalled();
    expect(patch).not.toHaveBeenCalled();
  });

  it("does not queue an unusable scrape when configuration is absent", async () => {
    const { ctx, runAfter } = context({ configured: false });
    expect(await requestRefresh(ctx, {})).toBe(false);
    expect(runAfter).not.toHaveBeenCalled();
  });
});
