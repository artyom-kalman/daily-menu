import { readFileSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import {
  formatMenuMessage,
  formatSpiciness,
  NO_MENU_INFO,
  shortenDescription,
} from "../convex/format";
import { looksLikeCafeteriaNotice } from "../convex/notices";
import { DEFAULT_MODEL, SYSTEM_PROMPT } from "../convex/openrouter";
import {
  isFreshForServing,
  needsCronRetry,
  nextRetryDelayMs,
  sameDishNames,
} from "../convex/refreshPolicy";
import { addCalendarDays } from "../convex/dates";
import {
  PRUNE_HOUR_UTC,
  PRUNE_MINUTE_UTC,
  RETENTION_DAYS,
  retentionCutoffDate,
  shouldPruneDate,
} from "../convex/prunePolicy";
import {
  APP_VERSION,
  APTABASE_FETCH_TIMEOUT_MS,
  CONVEX_DEV_DEPLOYMENT_HOST,
  EVENT_SCRAPE_EMPTY,
  EVENT_SCRAPE_ERROR,
  EVENT_SCRAPE_OK,
  EVENT_START,
  EVENT_TODAY_MENU,
  analyticsPropsOf,
  buildAptabaseEvent,
  hostFromAppKey,
  isDebugFromEnv,
  newSessionId,
  resolveAptabaseHost,
  scrapeEventForStatus,
  trackAptabaseEvent,
} from "../convex/analytics";
import { parseMenuHtml, targetWeekdayIndex } from "../convex/scraper";
import { isAuthorizedWebhook } from "../convex/webhookAuth";
import {
  TODAY_MENU_BUTTON_LABEL,
  TODAY_MENU_CALLBACK,
  processTelegramUpdate,
  todayMenuKeyboard,
} from "../convex/telegramHandlers";
import {
  answerCallbackQuery,
  sendMessage,
} from "../convex/telegramClient";
import {
  fetchTelegramWebhookInfo,
  registerTelegramWebhook,
  webhookUrlFromSiteUrl,
} from "../convex/telegramWebhook";

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

type TelegramCall = { method: string; body: Record<string, unknown> };

async function withMockTelegram<T>(
  run: (calls: TelegramCall[]) => Promise<T>,
  options?: {
    respond?: (call: TelegramCall) => { status?: number; body: unknown };
  },
): Promise<T> {
  const calls: TelegramCall[] = [];
  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const bodyText = await readBody(req);
    const body = bodyText ? (JSON.parse(bodyText) as Record<string, unknown>) : {};
    const url = req.url ?? "";
    // /bot<token>/<method>
    const method = url.split("/").pop() ?? "unknown";
    const call: TelegramCall = { method, body };
    calls.push(call);
    const response = options?.respond?.(call) ?? {
      status: 200,
      body:
        method === "getWebhookInfo"
          ? {
              ok: true,
              result: {
                url: "https://example.convex.site/telegram/webhook",
                pending_update_count: 0,
              },
            }
          : { ok: true, result: true },
    };
    res.writeHead(response.status ?? 200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(response.body));
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const addr = server.address();
  if (!addr || typeof addr === "string") {
    throw new Error("failed to bind mock telegram");
  }
  const prevBase = process.env.TELEGRAM_API_BASE;
  const prevToken = process.env.TELEGRAM_BOT_TOKEN;
  process.env.TELEGRAM_API_BASE = `http://127.0.0.1:${addr.port}`;
  process.env.TELEGRAM_BOT_TOKEN = "test-token";

  try {
    return await run(calls);
  } finally {
    if (prevBase === undefined) delete process.env.TELEGRAM_API_BASE;
    else process.env.TELEGRAM_API_BASE = prevBase;
    if (prevToken === undefined) delete process.env.TELEGRAM_BOT_TOKEN;
    else process.env.TELEGRAM_BOT_TOKEN = prevToken;
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    );
  }
}

describe("scraper", () => {
  it("maps weekdays to foodList index", () => {
    expect(targetWeekdayIndex(1)).toBe(0);
    expect(targetWeekdayIndex(5)).toBe(4);
    expect(targetWeekdayIndex(0)).toBe(4);
    expect(targetWeekdayIndex(6)).toBe(4);
  });

  it("parses foodList for the target weekday", () => {
    const html = `
      <ul class="foodList"><li class="foodItem">Mon A</li></ul>
      <ul class="foodList"><li class="foodItem">Tue A</li><li class="foodItem">Tue B</li></ul>
      <ul class="foodList"><li class="foodItem">Wed A</li></ul>
      <ul class="foodList"><li class="foodItem">Thu A</li></ul>
      <ul class="foodList"><li class="foodItem">Fri A</li></ul>
    `;
    expect(parseMenuHtml(html, 2)).toEqual(["Tue A", "Tue B"]);
    expect(parseMenuHtml(html, 0)).toEqual(["Fri A"]);
  });

  it("parses the live KBU Peony (category=4) Thursday column", () => {
    const html = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "fixtures/kbu-peony.html"),
      "utf8",
    );
    expect(parseMenuHtml(html, 4)).toEqual([
      "제육볶음",
      "쌀밥",
      "살코기감자탕",
      "치킨너겟*머스타드",
      "콩나물무침",
      "깍두기",
      "요구르트",
    ]);
    expect(parseMenuHtml(html, 5)).toEqual([]);
  });

  it("parses the live KBU Azilea (category=5) Thursday column, not just the first two dishes", () => {
    const html = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "fixtures/kbu-azilea.html"),
      "utf8",
    );
    expect(parseMenuHtml(html, 4)).toEqual([
      "눈꽃치즈닭갈비덮밥",
      "미역국",
      "피자고로케&케찹",
      "어묵채볶음",
      "숙주나물",
      "포기김치",
      "요구르트",
    ]);
    expect(parseMenuHtml(html, 1)).toEqual([]);
  });
});

describe("refreshPolicy", () => {
  const noInfo = {
    source: "no_info" as const,
    dishes: [],
    fetchedAt: 1,
  };
  const live = {
    source: "live" as const,
    dishes: [{ name: "미역국" }],
    fetchedAt: 1_000,
  };

  it("retries empty/no_info until a live menu exists", () => {
    expect(needsCronRetry(noInfo)).toBe(true);
    expect(needsCronRetry(null)).toBe(true);
    expect(needsCronRetry(live)).toBe(false);
  });

  it("treats a live menu as final and no_info as not fresh", () => {
    expect(isFreshForServing(noInfo)).toBe(false);
    expect(isFreshForServing(live)).toBe(true);
  });

  it("schedules 30 min retries from 09:00 through 12:30 KST", () => {
    expect(nextRetryDelayMs(8, 0)).toBe(60 * 60 * 1000);
    expect(nextRetryDelayMs(9, 0)).toBe(30 * 60 * 1000);
    expect(nextRetryDelayMs(12, 0)).toBe(30 * 60 * 1000);
    expect(nextRetryDelayMs(12, 20)).toBe(10 * 60 * 1000);
    expect(nextRetryDelayMs(12, 30)).toBeNull();
    expect(nextRetryDelayMs(13, 0)).toBeNull();
  });

  it("detects a later-posted longer menu as a change", () => {
    expect(sameDishNames(["눈꽃치즈닭갈비덮밥", "미역국"], ["눈꽃치즈닭갈비덮밥", "미역국"])).toBe(
      true,
    );
    expect(
      sameDishNames(
        ["눈꽃치즈닭갈비덮밥", "미역국"],
        ["눈꽃치즈닭갈비덮밥", "미역국", "피자고로케&케찹"],
      ),
    ).toBe(false);
  });
});

describe("prunePolicy", () => {
  const today = "2026-09-04";

  it("keeps a 30-day window and never prunes today", () => {
    expect(RETENTION_DAYS).toBe(30);
    expect(retentionCutoffDate(today)).toBe("2026-08-05");
    expect(shouldPruneDate("2026-08-04", today)).toBe(true);
    expect(shouldPruneDate("2026-08-05", today)).toBe(false);
    expect(shouldPruneDate("2026-09-03", today)).toBe(false);
    expect(shouldPruneDate(today, today)).toBe(false);
    expect(shouldPruneDate(today, today, 0)).toBe(false);
  });

  it("shifts YYYY-MM-DD across month, year, and leap-day boundaries", () => {
    expect(addCalendarDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(addCalendarDays("2024-03-01", -1)).toBe("2024-02-29");
    expect(addCalendarDays("2026-01-15", -30)).toBe("2025-12-16");
    expect(addCalendarDays("2026-09-04", 0)).toBe("2026-09-04");
  });

  it("schedules prune at 00:00 KST (15:00 UTC)", () => {
    expect(PRUNE_HOUR_UTC).toBe(15);
    expect(PRUNE_MINUTE_UTC).toBe(0);
    const crons = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "../convex/crons.ts"),
      "utf8",
    );
    expect(crons).toMatch(/internal\.prune\.pruneOldData/);
    expect(crons).toMatch(/hourUTC:\s*PRUNE_HOUR_UTC/);
    expect(crons).toMatch(/minuteUTC:\s*PRUNE_MINUTE_UTC/);
  });
});

describe("aptabase analytics", () => {
  it("sends Aptabase Debug from the Convex dev deployment URL", () => {
    expect(
      isDebugFromEnv({
        CONVEX_CLOUD_URL: `https://${CONVEX_DEV_DEPLOYMENT_HOST}.eu-west-1.convex.cloud`,
      }),
    ).toBe(true);
    expect(
      isDebugFromEnv({
        CONVEX_SITE_URL: `https://${CONVEX_DEV_DEPLOYMENT_HOST}.convex.site`,
      }),
    ).toBe(true);
    expect(
      isDebugFromEnv({
        CONVEX_CLOUD_URL: "https://some-other-prod.convex.cloud",
      }),
    ).toBe(false);
    expect(isDebugFromEnv({ CONVEX_DEPLOYMENT: "dev:enchanted-goshawk-667" })).toBe(
      true,
    );
    expect(isDebugFromEnv({ APTABASE_DEBUG: "0", CONVEX_DEPLOYMENT: "dev:x" })).toBe(
      false,
    );
    expect(
      isDebugFromEnv({
        APTABASE_DEBUG: "1",
        CONVEX_CLOUD_URL: "https://some-other-prod.convex.cloud",
      }),
    ).toBe(true);
  });

  it("maps scrape status to event names", () => {
    expect(scrapeEventForStatus("success")).toBe(EVENT_SCRAPE_OK);
    expect(scrapeEventForStatus("empty")).toBe(EVENT_SCRAPE_EMPTY);
    expect(scrapeEventForStatus("error")).toBe(EVENT_SCRAPE_ERROR);
  });

  it("picks the Aptabase host from the app key region", () => {
    expect(hostFromAppKey("A-EU-0000000000")).toBe("https://eu.aptabase.com");
    expect(hostFromAppKey("A-US-0000000000")).toBe("https://us.aptabase.com");
    expect(hostFromAppKey("A-DEV-0000000000")).toBe("http://localhost:3000");
    expect(hostFromAppKey("A-SH-0000000000")).toBeUndefined();
    expect(hostFromAppKey("not-a-key")).toBeUndefined();
  });

  it("prefers APTABASE_HOST over the key region", () => {
    expect(resolveAptabaseHost("A-EU-0000000000", "https://self.example/")).toBe(
      "https://self.example",
    );
    expect(resolveAptabaseHost("A-EU-0000000000")).toBe("https://eu.aptabase.com");
  });

  it("builds session ids as unix seconds plus 8 digits", () => {
    expect(newSessionId(1_713_516_247_065)).toMatch(/^1713516247\d{8}$/);
  });

  it("keeps only cafeteria and date props — no chatId or menu text", () => {
    expect(
      analyticsPropsOf({
        cafeteria: "peony",
        date: "2026-09-05",
      }),
    ).toEqual({ cafeteria: "peony", date: "2026-09-05" });
    const event = buildAptabaseEvent({
      eventName: EVENT_TODAY_MENU,
      now: new Date("2026-09-05T00:00:00.000Z"),
      sessionId: "171351624700000001",
    });
    expect(JSON.stringify(event)).not.toMatch(/chatId|chat_id|비빔밥/);
    expect(event.eventName).toBe(EVENT_TODAY_MENU);
    expect(event.systemProps.appVersion).toBe(APP_VERSION);
    expect(event.systemProps.osName).toBe("Telegram");
  });

  it("does not call Aptabase when the app key is missing", async () => {
    const calls: unknown[] = [];
    await trackAptabaseEvent(EVENT_START, undefined, {
      appKey: undefined,
      fetchImpl: (async (...args: unknown[]) => {
        calls.push(args);
        return new Response("ok", { status: 200 });
      }) as typeof fetch,
    });
    expect(calls).toHaveLength(0);
  });

  it("POSTs a one-event batch to /api/v0/events", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    await trackAptabaseEvent(
      EVENT_SCRAPE_OK,
      { cafeteria: "azilea", date: "2026-09-05" },
      {
        appKey: "A-EU-0000000000",
        now: new Date("2026-09-05T01:02:03.000Z"),
        sessionId: "171351624700000001",
        isDebug: true,
        fetchImpl: (async (url: string, init?: RequestInit) => {
          calls.push({ url: String(url), init: init ?? {} });
          return new Response(null, { status: 200 });
        }) as typeof fetch,
      },
    );
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://eu.aptabase.com/api/v0/events");
    expect(calls[0].init.method).toBe("POST");
    expect(calls[0].init.signal).toBeInstanceOf(AbortSignal);
    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers["App-Key"]).toBe("A-EU-0000000000");
    const body = JSON.parse(String(calls[0].init.body));
    expect(body).toHaveLength(1);
    expect(body[0].eventName).toBe(EVENT_SCRAPE_OK);
    expect(body[0].props).toEqual({ cafeteria: "azilea", date: "2026-09-05" });
    expect(JSON.stringify(body)).not.toMatch(/chatId|chat_id/);
  });

  it("swallows Aptabase HTTP errors so the bot still works", async () => {
    await expect(
      trackAptabaseEvent(EVENT_START, undefined, {
        appKey: "A-EU-0000000000",
        fetchImpl: (async () => new Response("nope", { status: 500 })) as typeof fetch,
      }),
    ).resolves.toBeUndefined();
  });

  it("aborts a hung Aptabase request and still resolves", async () => {
    vi.useFakeTimers();
    try {
      let signal: AbortSignal | undefined;
      const pending = trackAptabaseEvent(EVENT_START, undefined, {
        appKey: "A-EU-0000000000",
        fetchImpl: ((_url, init) => {
          signal = init?.signal;
          return new Promise((_resolve, reject) => {
            signal?.addEventListener("abort", () => {
              reject(new DOMException("The operation was aborted.", "AbortError"));
            });
          });
        }) as typeof fetch,
      });
      expect(signal?.aborted).toBe(false);
      await vi.advanceTimersByTimeAsync(APTABASE_FETCH_TIMEOUT_MS);
      expect(signal?.aborted).toBe(true);
      await expect(pending).resolves.toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("cafeteria notices", () => {
  it("recognizes posted closed-day text as a notice, not a missing menu", () => {
    expect(looksLikeCafeteriaNotice(["추석 연휴 휴무"])).toBe(true);
    expect(looksLikeCafeteriaNotice(["제육볶음", "쌀밥"])).toBe(false);
  });
});

describe("openrouter model", () => {
  it("defaults to Llama 3.3 70B instruct via OpenRouter", () => {
    expect(DEFAULT_MODEL).toBe("meta-llama/llama-3.3-70b-instruct:free");
  });

  it("asks for one short clause, not two marketing sentences", () => {
    expect(SYSTEM_PROMPT).toMatch(/6–10 слов/);
    expect(SYSTEM_PROMPT).toMatch(/Не пиши второе предложение/);
    expect(SYSTEM_PROMPT).not.toMatch(/максимум 2 предложения/);
  });
});

describe("formatMenuMessage", () => {
  const longJjidmdak =
    "Нежная курица, тушённая в ароматном соевом соусе с овощами, стеклянной лапшой и картофелем. Сытное и согревающее блюдо, которое обязательно стоит попробовать.";

  it("keeps the first sentence and drops the marketing tail", () => {
    const short = shortenDescription(longJjidmdak);
    expect(short).not.toContain("обязательно");
    expect(short.length).toBeLessThan(longJjidmdak.length);
    expect(short.endsWith("…") || short.length <= 56).toBe(true);
  });

  it("leaves a short clause alone", () => {
    expect(shortenDescription("острый суп")).toBe("острый суп");
  });

  it("keeps the clause before an em dash", () => {
    expect(
      shortenDescription(
        "Аппетитный рассыпчатый белый рис — идеальное дополнение к любому блюду. Заряжает энергией на весь день.",
      ),
    ).toBe("Аппетитный рассыпчатый белый рис");
  });

  it("omits chili at 0 and repeats it for 1–5", () => {
    expect(formatSpiciness(0)).toBe("");
    expect(formatSpiciness(3)).toBe(" 🌶🌶🌶");
    expect(formatSpiciness(5)).toBe(" 🌶🌶🌶🌶🌶");
  });

  it("formats both cafeterias as a short scannable list", () => {
    const text = formatMenuMessage(
      {
        dishes: [
          { name: "김치찌개", description: "острый суп", spiciness: 3 },
        ],
      },
      { dishes: [] },
    );
    expect(text).toContain("🍽️ Сегодня");
    expect(text).toContain("Peony · верхняя");
    expect(text).toContain("Azilea · нижняя");
    expect(text).toContain("김치찌개 🌶🌶🌶 — острый суп");
    expect(text).toContain(NO_MENU_INFO);
    expect(text).not.toContain("1)");
    expect(text).not.toContain("выходной");
  });

  it("shortens already-stored long blurbs and hides zero spice", () => {
    const text = formatMenuMessage(
      {
        dishes: [
          { name: "찜닭", description: longJjidmdak, spiciness: 2 },
          { name: "쌀밥", description: "белый рис", spiciness: 0 },
        ],
      },
      null,
    );
    expect(text).toContain("찜닭 🌶🌶 — ");
    expect(text).not.toContain("обязательно");
    expect(text).toContain("쌀밥 — белый рис");
    expect(text).not.toMatch(/쌀밥 🌶/);
  });

  it("shows a posted closed notice instead of no-info, without chili", () => {
    const text = formatMenuMessage(
      { dishes: [{ name: "추석 연휴 휴무", description: "", spiciness: 0 }] },
      null,
    );
    expect(text).toContain("추석 연휴 휴무");
    expect(text).not.toContain("🌶");
    expect(text).toMatch(/Peony[\s\S]*추석 연휴 휴무[\s\S]*Azilea[\s\S]*Нет информации/);
  });
});

describe("webhook secret", () => {
  it("rejects when the expected secret is missing", () => {
    expect(isAuthorizedWebhook(undefined, "anything")).toBe(false);
    expect(isAuthorizedWebhook("", "anything")).toBe(false);
  });

  it("rejects a missing or wrong provided token", () => {
    expect(isAuthorizedWebhook("secret", null)).toBe(false);
    expect(isAuthorizedWebhook("secret", "")).toBe(false);
    expect(isAuthorizedWebhook("secret", "nope")).toBe(false);
  });

  it("accepts only an exact match", () => {
    expect(isAuthorizedWebhook("secret", "secret")).toBe(true);
  });

  it("keeps Convex query, mutation, and action functions internal", () => {
    const convexDir = join(dirname(fileURLToPath(import.meta.url)), "../convex");
    for (const file of [
      "menus.ts",
      "appConfig.ts",
      "telegram.ts",
      "telegramWebhook.ts",
      "prune.ts",
      "analytics.ts",
    ]) {
      const source = readFileSync(join(convexDir, file), "utf8");
      expect(source).not.toMatch(
        /^\s*export const \w+ = (query|mutation|action)\(/m,
      );
    }
  });

  it("registers the webhook from CONVEX_SITE_URL, not a pasted URL", () => {
    const telegramTs = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "../convex/telegram.ts"),
      "utf8",
    );
    expect(telegramTs).toMatch(/export const setWebhook = internalAction\(/);
    expect(telegramTs).toMatch(/process\.env\.CONVEX_SITE_URL/);
    expect(telegramTs).not.toMatch(/https:\/\/[^\s"]+\.convex\.site/);
  });

  it("does not auto-register a webhook on cron or HTTP (npx convex dev is safe)", () => {
    const convexDir = join(dirname(fileURLToPath(import.meta.url)), "../convex");
    for (const file of ["crons.ts", "http.ts"]) {
      const source = readFileSync(join(convexDir, file), "utf8");
      expect(source).not.toMatch(/setWebhook|registerTelegramWebhook/);
    }
  });
});

describe("telegram webhook registration", () => {
  it("builds the webhook URL from the deployment site URL", () => {
    expect(webhookUrlFromSiteUrl("https://happy-animal-123.convex.site")).toBe(
      "https://happy-animal-123.convex.site/telegram/webhook",
    );
    expect(webhookUrlFromSiteUrl("https://happy-animal-123.convex.site/")).toBe(
      "https://happy-animal-123.convex.site/telegram/webhook",
    );
  });

  it("refuses to register without site URL, bot token, or secret", async () => {
    expect(
      await registerTelegramWebhook({
        siteUrl: undefined,
        botToken: "tok",
        secretToken: "sec",
      }),
    ).toEqual({ ok: false, error: "CONVEX_SITE_URL is not set" });
    expect(
      await registerTelegramWebhook({
        siteUrl: "https://dev.convex.site",
        botToken: undefined,
        secretToken: "sec",
      }),
    ).toEqual({ ok: false, error: "TELEGRAM_BOT_TOKEN is not set" });
    expect(
      await registerTelegramWebhook({
        siteUrl: "https://dev.convex.site",
        botToken: "tok",
        secretToken: undefined,
      }),
    ).toEqual({ ok: false, error: "TELEGRAM_WEBHOOK_SECRET is not set" });
  });

  it("points this token at this deployment's /telegram/webhook", async () => {
    await withMockTelegram(async (calls) => {
      const result = await registerTelegramWebhook({
        siteUrl: "https://dev-only.convex.site",
        botToken: "dev-bot-token",
        secretToken: "dev-secret",
        apiBase: process.env.TELEGRAM_API_BASE,
      });
      expect(result).toEqual({
        ok: true,
        url: "https://dev-only.convex.site/telegram/webhook",
      });
      expect(calls).toHaveLength(1);
      expect(calls[0].method).toBe("setWebhook");
      expect(calls[0].body).toEqual({
        url: "https://dev-only.convex.site/telegram/webhook",
        secret_token: "dev-secret",
        allowed_updates: ["message", "callback_query"],
      });
    });
  });

  it("does not send a production site URL when registering the dev bot", async () => {
    await withMockTelegram(async (calls) => {
      await registerTelegramWebhook({
        siteUrl: "https://dev-only.convex.site",
        botToken: "dev-bot-token",
        secretToken: "dev-secret",
        apiBase: process.env.TELEGRAM_API_BASE,
      });
      const posted = JSON.stringify(calls[0].body);
      expect(posted).toContain("https://dev-only.convex.site/telegram/webhook");
      expect(posted).not.toContain("prod");
    });
  });

  it("surfaces a Telegram setWebhook error", async () => {
    await withMockTelegram(
      async () => {
        const result = await registerTelegramWebhook({
          siteUrl: "https://dev-only.convex.site",
          botToken: "dev-bot-token",
          secretToken: "dev-secret",
          apiBase: process.env.TELEGRAM_API_BASE,
        });
        expect(result).toEqual({
          ok: false,
          error: "Webhook URL is invalid",
        });
      },
      {
        respond: () => ({
          status: 400,
          body: { ok: false, description: "Webhook URL is invalid" },
        }),
      },
    );
  });

  it("reads the webhook currently registered for this token", async () => {
    await withMockTelegram(async () => {
      const result = await fetchTelegramWebhookInfo({
        botToken: "dev-bot-token",
        apiBase: process.env.TELEGRAM_API_BASE,
      });
      expect(result).toEqual({
        ok: true,
        url: "https://example.convex.site/telegram/webhook",
        pendingUpdateCount: 0,
      });
    });
  });

  it("rejects a 2xx setWebhook body that is not { ok: true, result: true }", async () => {
    const malformedBodies = [
      { ok: true, result: "Webhook was set" },
      { result: true },
      { ok: 1, result: true },
    ];
    for (const body of malformedBodies) {
      await withMockTelegram(
        async () => {
          const result = await registerTelegramWebhook({
            siteUrl: "https://dev-only.convex.site",
            botToken: "dev-bot-token",
            secretToken: "dev-secret",
            apiBase: process.env.TELEGRAM_API_BASE,
          });
          expect(result.ok).toBe(false);
        },
        { respond: () => ({ status: 200, body }) },
      );
    }
  });

  it("rejects a 2xx getWebhookInfo body without a result object and string url", async () => {
    const malformedBodies = [
      { ok: true, result: { pending_update_count: 0 } },
      { ok: true },
      { ok: true, result: { url: 1 } },
    ];
    for (const body of malformedBodies) {
      await withMockTelegram(
        async () => {
          const result = await fetchTelegramWebhookInfo({
            botToken: "dev-bot-token",
            apiBase: process.env.TELEGRAM_API_BASE,
          });
          expect(result.ok).toBe(false);
        },
        { respond: () => ({ status: 200, body }) },
      );
    }
  });

  it("accepts getWebhookInfo with an empty url when the result shape is valid", async () => {
    await withMockTelegram(
      async () => {
        const result = await fetchTelegramWebhookInfo({
          botToken: "dev-bot-token",
          apiBase: process.env.TELEGRAM_API_BASE,
        });
        expect(result).toEqual({ ok: true, url: "" });
      },
      {
        respond: () => ({
          status: 200,
          body: { ok: true, result: { url: "" } },
        }),
      },
    );
  });
});

describe("telegram button e2e", () => {
  it("message shows one button; callback returns today's menu via Telegram API", async () => {
    await withMockTelegram(async (calls) => {
      const menus = {
        peony: {
          dishes: [
            { name: "비빔밥", description: "рис с овощами", spiciness: 1 },
          ],
        },
        azilea: {
          dishes: [
            { name: "된장찌개", description: "соевый суп", spiciness: 0 },
          ],
        },
      };

      const tracked: string[] = [];
      const deps = {
        getTodayMenus: async () => menus,
        sendMessage,
        answerCallbackQuery,
        trackEvent: async (eventName: string) => {
          tracked.push(eventName);
        },
      };

      const start = await processTelegramUpdate(
        { message: { chat: { id: 42 }, text: "/start" } },
        deps,
      );
      expect(start).toBe("ok");
      expect(tracked).toEqual([EVENT_START]);
      expect(calls).toHaveLength(1);
      expect(calls[0].method).toBe("sendMessage");
      expect(calls[0].body.chat_id).toBe(42);
      expect(calls[0].body.reply_markup).toEqual(todayMenuKeyboard());
      expect(JSON.stringify(calls[0].body.reply_markup)).toContain(
        TODAY_MENU_CALLBACK,
      );
      expect(JSON.stringify(calls[0].body.reply_markup)).toContain(
        TODAY_MENU_BUTTON_LABEL,
      );

      calls.length = 0;

      const press = await processTelegramUpdate(
        {
          callback_query: {
            id: "cb-1",
            data: TODAY_MENU_CALLBACK,
            message: { chat: { id: 42 } },
          },
        },
        deps,
      );
      expect(press).toBe("ok");
      expect(calls.map((c) => c.method)).toEqual([
        "answerCallbackQuery",
        "sendMessage",
      ]);
      expect(calls[0].body.callback_query_id).toBe("cb-1");
      const menuText = String(calls[1].body.text);
      expect(menuText).toBe(formatMenuMessage(menus.peony, menus.azilea));
      expect(menuText).toContain("비빔밥 🌶 — рис с овощами");
      expect(menuText).toContain("된장찌개 — соевый суп");
      expect(calls[1].body.reply_markup).toEqual(todayMenuKeyboard());
      expect(tracked).toEqual([EVENT_START, EVENT_TODAY_MENU]);
    });
  });

  it("keeps the button on the error fallback", async () => {
    await withMockTelegram(async (calls) => {
      await processTelegramUpdate(
        {
          callback_query: {
            id: "cb-err",
            data: TODAY_MENU_CALLBACK,
            message: { chat: { id: 42 } },
          },
        },
        {
          getTodayMenus: async () => {
            throw new Error("db down");
          },
          sendMessage,
          answerCallbackQuery,
        },
      );
      expect(calls.map((c) => c.method)).toEqual([
        "answerCallbackQuery",
        "sendMessage",
      ]);
      expect(String(calls[1].body.text)).toContain("Не удалось получить меню");
      expect(calls[1].body.reply_markup).toEqual(todayMenuKeyboard());
    });
  });

  it("does not track today_menu for an unknown callback", async () => {
    const tracked: string[] = [];
    await processTelegramUpdate(
      {
        callback_query: {
          id: "cb-other",
          data: "not_today",
          message: { chat: { id: 7 } },
        },
      },
      {
        getTodayMenus: async () => {
          throw new Error("should not fetch menus");
        },
        sendMessage: async () => undefined,
        answerCallbackQuery: async () => undefined,
        trackEvent: async (eventName) => {
          tracked.push(eventName);
        },
      },
    );
    expect(tracked).toEqual([]);
  });

  it("still sends the start button if trackEvent throws", async () => {
    await withMockTelegram(async (calls) => {
      const result = await processTelegramUpdate(
        { message: { chat: { id: 9 }, text: "hi" } },
        {
          getTodayMenus: async () => ({ peony: null, azilea: null }),
          sendMessage,
          answerCallbackQuery,
          trackEvent: async () => {
            throw new Error("aptabase down");
          },
        },
      );
      expect(result).toBe("ok");
      expect(calls).toHaveLength(1);
      expect(calls[0].method).toBe("sendMessage");
    });
  });
});
