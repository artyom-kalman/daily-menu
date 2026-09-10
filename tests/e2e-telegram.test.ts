import { readFileSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import {
  escapeHtml,
  formatMenuMessage,
  formatSpiciness,
  inferCourse,
  NO_MENU_INFO,
} from "../convex/format";
import { looksLikeCafeteriaNotice } from "../convex/notices";
import { DEFAULT_MODEL, SYSTEM_PROMPT } from "../convex/openrouter";
import { shouldSendMorningPush, isPushableFoodMenu } from "../convex/morningPushPolicy";
import { addCalendarDays, formatKstClock, isKstWeekend, weekdayFromYmd } from "../convex/dates";
import { scrapeCafeteriasSafely } from "../convex/scrapeAll";
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
import {
  isCompleteLiveMenu,
  isFreshForServing,
  MIN_READY_DISH_COUNT,
  needsCronRetry,
  nextRetryDelayMs,
  sameDishNames,
} from "../convex/refreshPolicy";
import { parseMenuHtml, targetWeekdayIndex } from "../convex/scraper";
import { isAuthorizedWebhook } from "../convex/webhookAuth";
import {
  REFETCHING_MESSAGE,
  MENU_UNAVAILABLE_MESSAGE,
  STATS_UNSET_MESSAGE,
  SUBSCRIBE_BUTTON_LABEL,
  SUBSCRIBE_CALLBACK,
  SUBSCRIBE_FAILED_MESSAGE,
  SUBSCRIBED_MESSAGE,
  UNSUBSCRIBE_BUTTON_LABEL,
  UNSUBSCRIBE_CALLBACK,
  UNSUBSCRIBE_FAILED_MESSAGE,
  UNSUBSCRIBED_MESSAGE,
  TODAY_MENU_BUTTON_LABEL,
  TODAY_MENU_CALLBACK,
  deliverMorningPushes,
  formatAdminStatus,
  formatRefetchSummary,
  isAdminChat,
  parseAdminCommand,
  processTelegramUpdate,
  toAdminStatus,
  todayMenuKeyboard,
} from "../convex/telegramHandlers";
import {
  answerCallbackQuery,
  editMessageReplyMarkup,
  isBlockedTelegramError,
  sendMessage,
  sendMessageResult,
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
  const stub = {
    source: "live" as const,
    dishes: [{ name: "오므라이스" }],
    fetchedAt: 1_000,
  };
  const notice = {
    source: "live" as const,
    dishes: [{ name: "추석 연휴 휴무" }],
    fetchedAt: 1_000,
  };
  const shortTray = {
    source: "live" as const,
    dishes: [{ name: "잔치국수" }, { name: "추가밥" }],
    fetchedAt: 1_000,
  };
  const fourDishes = {
    source: "live" as const,
    dishes: [
      { name: "오므라이스" },
      { name: "쌀밥" },
      { name: "포기김치" },
      { name: "요구르트" },
    ],
    fetchedAt: 1_000,
  };
  const tray = {
    source: "live" as const,
    dishes: [
      { name: "눈꽃치즈닭갈비덮밥" },
      { name: "미역국" },
      { name: "피자고로케&케찹" },
      { name: "어묵채볶음" },
      { name: "숙주나물" },
    ],
    fetchedAt: 1_000,
  };

  it("retries empty/no_info until a complete live menu exists", () => {
    expect(MIN_READY_DISH_COUNT).toBe(5);
    expect(needsCronRetry(noInfo)).toBe(true);
    expect(needsCronRetry(null)).toBe(true);
    expect(needsCronRetry(stub)).toBe(true);
    expect(needsCronRetry(shortTray)).toBe(true);
    expect(needsCronRetry(fourDishes)).toBe(true);
    expect(needsCronRetry(notice)).toBe(false);
    expect(needsCronRetry(tray)).toBe(false);
  });

  it("treats a short stub as not ready and a notice or 5-dish tray as fresh", () => {
    expect(isCompleteLiveMenu(stub)).toBe(false);
    expect(isCompleteLiveMenu(fourDishes)).toBe(false);
    expect(isFreshForServing(noInfo)).toBe(false);
    expect(isFreshForServing(stub)).toBe(false);
    expect(isFreshForServing(shortTray)).toBe(false);
    expect(isFreshForServing(notice)).toBe(true);
    expect(isFreshForServing(tray)).toBe(true);
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
    expect(
      sameDishNames(["오므라이스"], ["오므라이스", "쌀밥", "포기김치"]),
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

  it("asks for a name translation only, not a spoken prefix or a review", () => {
    expect(SYSTEM_PROMPT).toMatch(/тушёная курица/);
    expect(SYSTEM_PROMPT).toMatch(/Не транслитерируй хангыль/);
    expect(SYSTEM_PROMPT).toMatch(/Не перечисляй скрытые ингредиенты/);
    expect(SYSTEM_PROMPT).not.toMatch(/сначала как это говорят/);
    expect(SYSTEM_PROMPT).not.toMatch(/максимум 2 предложения/);
    expect(SYSTEM_PROMPT).not.toMatch(/6–10 слов/);
  });
});

describe("formatMenuMessage", () => {
  it("omits chili at 0 and prints one pepper plus the level", () => {
    expect(formatSpiciness(0)).toBe("");
    expect(formatSpiciness(3)).toBe(" 🌶3");
    expect(formatSpiciness(5)).toBe(" 🌶5");
  });

  it("groups a soup under Суп and keeps chili at the end of the line", () => {
    const text = formatMenuMessage(
      {
        dishes: [
          { name: "김치찌개", description: "острый суп", spiciness: 3 },
        ],
      },
      { dishes: [] },
    );
    expect(text).not.toContain("Сегодня");
    expect(text).toContain("Peony · верхняя");
    expect(text).toContain("Azilea · нижняя");
    expect(text).toContain("<i>Суп</i>\n<b>김치찌개</b> — <i>острый суп</i> 🌶3");
    expect(text).toContain(NO_MENU_INFO);
    expect(text).not.toContain("1)");
    expect(text).not.toContain("выходной");
  });

  it("groups mains vs staples and prints description as stored", () => {
    const text = formatMenuMessage(
      {
        dishes: [
          { name: "찜닭", description: "тушёная курица", spiciness: 2 },
          { name: "쌀밥", description: "рис", spiciness: 0 },
        ],
      },
      null,
    );
    expect(text).toContain("<i>Горячее</i>\n<b>찜닭</b> — <i>тушёная курица</i> 🌶2");
    expect(text).toContain("<i>Ещё</i>\n<b>쌀밥</b>");
    expect(text).not.toMatch(/쌀밥 🌶/);
  });

  it("infers tray slots from Hangul without a schema field", () => {
    expect(inferCourse("김치찌개")).toBe("soup");
    expect(inferCourse("미역국")).toBe("soup");
    expect(inferCourse("잔치국수")).toBe("hot");
    expect(inferCourse("비빔밥")).toBe("hot");
    expect(inferCourse("쌀밥")).toBe("side");
    expect(inferCourse("추가밥")).toBe("side");
    expect(inferCourse("포기김치")).toBe("side");
    expect(inferCourse("요구르트")).toBe("side");
    expect(inferCourse("딸기요플레")).toBe("side");
    expect(inferCourse("단무지")).toBe("side");
    expect(inferCourse("피클")).toBe("side");
    expect(inferCourse("무생채")).toBe("salad");
    expect(inferCourse("콩나물맛살냉채")).toBe("salad");
    expect(inferCourse("찜닭")).toBe("hot");
  });

  it("bunches pickles and yoplait with staples, not under Горячее", () => {
    const text = formatMenuMessage(
      null,
      {
        dishes: [
          { name: "순살찜닭덮밥", description: "рис с тушёной курицей", spiciness: 2 },
          { name: "버터갈릭감자튀김", description: "картофель фри с чесноком", spiciness: 0 },
          { name: "단무지", description: "маринованная редька", spiciness: 0 },
          { name: "딸기요플레", description: "клубничный йогурт", spiciness: 0 },
          { name: "경상도식소고기무국", description: "говяжий суп с редькой", spiciness: 0 },
          { name: "쫄면무침", description: "острая холодная лапша", spiciness: 4 },
          { name: "포기김치", description: "кимчи", spiciness: 3 },
        ],
      },
    );
    expect(text).toContain(
      "<i>Горячее</i>\n<b>순살찜닭덮밥</b> — <i>рис с тушёной курицей</i> 🌶2\n<b>버터갈릭감자튀김</b> — <i>картофель фри с чесноком</i>",
    );
    expect(text).toContain("<i>Суп</i>\n<b>경상도식소고기무국</b>");
    expect(text).toContain("<i>Салат</i>\n<b>쫄면무침</b>");
    const hot = text.split("<i>Суп</i>")[0];
    expect(hot).not.toContain("단무지");
    expect(hot).not.toContain("요플레");
    expect(text).toContain(
      "<i>Ещё</i>\n<b>단무지</b> · <b>딸기요플레</b> · <b>포기김치</b> 🌶3",
    );
  });

  it("renders A dictionary gloss + A5 tray groups", () => {
    const text = formatMenuMessage(
      {
        dishes: [
          { name: "찜닭", description: "тушёная курица", spiciness: 2 },
          { name: "쌀밥", description: "рис", spiciness: 0 },
          { name: "미역국", description: "суп из вакаме", spiciness: 0 },
          { name: "생선까스", description: "рыбная котлета", spiciness: 0 },
          { name: "무생채", description: "салат из редьки", spiciness: 2 },
          { name: "포기김치", description: "кимчи", spiciness: 3 },
          { name: "요구르트", description: "йогурт", spiciness: 0 },
        ],
      },
      {
        dishes: [
          { name: "잔치국수", description: "лапша в бульоне", spiciness: 0 },
          { name: "추가밥", description: "добавка риса", spiciness: 0 },
          { name: "돈육간장불고기", description: "свинина в соевом соусе", spiciness: 1 },
          { name: "갈비만두찜", description: "пельмени на пару", spiciness: 0 },
          { name: "콩나물맛살냉채", description: "холодный салат из проростков", spiciness: 0 },
          { name: "포기김치", description: "кимчи", spiciness: 3 },
          { name: "요구르트", description: "йогурт", spiciness: 0 },
        ],
      },
    );
    expect(text).toBe(
      [
        "<b>🌸 Peony · верхняя</b>",
        "<i>Горячее</i>",
        "<b>찜닭</b> — <i>тушёная курица</i> 🌶2",
        "<b>생선까스</b> — <i>рыбная котлета</i>",
        "<i>Суп</i>",
        "<b>미역국</b> — <i>суп из вакаме</i>",
        "<i>Салат</i>",
        "<b>무생채</b> — <i>салат из редьки</i> 🌶2",
        "<i>Ещё</i>",
        "<b>쌀밥</b> · <b>포기김치</b> 🌶3 · <b>요구르트</b>",
        "",
        "<b>🌺 Azilea · нижняя</b>",
        "<i>Горячее</i>",
        "<b>잔치국수</b> — <i>лапша в бульоне</i>",
        "<b>돈육간장불고기</b> — <i>свинина в соевом соусе</i> 🌶1",
        "<b>갈비만두찜</b> — <i>пельмени на пару</i>",
        "<i>Салат</i>",
        "<b>콩나물맛살냉채</b> — <i>холодный салат из проростков</i>",
        "<i>Ещё</i>",
        "<b>추가밥</b> · <b>포기김치</b> 🌶3 · <b>요구르트</b>",
      ].join("\n"),
    );
  });

  it("escapes HTML in dish names and leaves asterisks alone", () => {
    expect(escapeHtml("A & B <C>")).toBe("A &amp; B &lt;C&gt;");
    const text = formatMenuMessage(
      {
        dishes: [
          {
            name: "치킨까스*치폴레S",
            description: "котлета A & B",
            spiciness: 2,
          },
        ],
      },
      null,
    );
    expect(text).toContain(
      "<b>치킨까스*치폴레S</b> — <i>котлета A &amp; B</i> 🌶2",
    );
    expect(text).not.toContain("<b>치킨까스</b>");
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

describe("scrapeCafeteriasSafely", () => {
  it("records a thrown cafeteria scrape and still runs the other", async () => {
    const seen: string[] = [];
    const results = await scrapeCafeteriasSafely(async (cafeteria) => {
      seen.push(cafeteria);
      if (cafeteria === "peony") {
        throw new Error("HTTP 500 from peony");
      }
      return { ok: true, dishCount: 4 };
    });
    expect(seen).toEqual(["peony", "azilea"]);
    expect(results).toEqual({
      peony: { ok: false, dishCount: 0, error: "HTTP 500 from peony" },
      azilea: { ok: true, dishCount: 4 },
    });
  });
});

describe("admin command helpers", () => {
  it("parses slash commands and strips a bot mention", () => {
    expect(parseAdminCommand("/status")).toBe("status");
    expect(parseAdminCommand("/status@daily_menu_dev_bot extra")).toBe("status");
    expect(parseAdminCommand("/Refetch")).toBe("refetch");
    expect(parseAdminCommand("/stats")).toBe("stats");
    expect(parseAdminCommand("/start")).toBeNull();
    expect(parseAdminCommand("status")).toBeNull();
  });

  it("matches ADMIN_CHAT_ID as a string", () => {
    expect(isAdminChat(99, "99")).toBe(true);
    expect(isAdminChat(99, " 99 ")).toBe(true);
    expect(isAdminChat(42, "99")).toBe(false);
    expect(isAdminChat(99, undefined)).toBe(false);
  });

  it("formats status and refetch replies", () => {
    const fetchedAt = Date.parse("2026-09-05T00:12:00.000Z");
    const attemptedAt = Date.parse("2026-09-05T02:30:00.000Z");
    expect(formatKstClock(fetchedAt)).toBe("09:12");
    const status = toAdminStatus(
      "2026-09-05",
      { source: "live", dishes: [{}, {}, {}, {}, {}, {}], fetchedAt },
      null,
      [
        { cafeteria: "peony", status: "success", attemptedAt: fetchedAt },
        {
          cafeteria: "azilea",
          status: "error",
          attemptedAt,
          error: "HTTP 500 from x",
        },
      ],
    );
    expect(formatAdminStatus(status)).toBe(
      "2026-09-05 KST\n\n" +
        "Peony  live  6 dishes  fetched 09:12\n" +
        "  last: success 09:12  (1 attempt)\n\n" +
        "Azilea  missing\n" +
        "  last: error 11:30 — HTTP 500 from x  (1 attempt)",
    );
    expect(
      formatRefetchSummary("2026-09-05", {
        peony: { ok: true, dishCount: 6 },
        azilea: { ok: false, dishCount: 0, error: "HTTP 500 from x" },
      }),
    ).toBe("Refetch 2026-09-05\nPeony: ok (6)\nAzilea: error (HTTP 500 from x)");
  });
});

describe("telegram button e2e", () => {
  it("message shows today's menu + buttons; callback refreshes the same menu", async () => {
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
      expect(calls[0].body.parse_mode).toBe("HTML");
      expect(calls[0].body.text).toBe(
        formatMenuMessage(menus.peony, menus.azilea),
      );
      expect(calls[0].body.reply_markup).toEqual(todayMenuKeyboard());
      expect(JSON.stringify(calls[0].body.reply_markup)).toContain(
        TODAY_MENU_CALLBACK,
      );
      expect(JSON.stringify(calls[0].body.reply_markup)).toContain(
        TODAY_MENU_BUTTON_LABEL,
      );
      expect(JSON.stringify(calls[0].body.reply_markup)).toContain(
        SUBSCRIBE_BUTTON_LABEL,
      );
      expect(JSON.stringify(calls[0].body.reply_markup)).toContain(
        SUBSCRIBE_CALLBACK,
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
      expect(menuText).toContain("<b>비빔밥</b> — <i>рис с овощами</i> 🌶1");
      expect(menuText).toContain("<b>된장찌개</b> — <i>соевый суп</i>");
      expect(calls[1].body.parse_mode).toBe("HTML");
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
      expect(String(calls[1].body.text)).toBe(MENU_UNAVAILABLE_MESSAGE);
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

  it("admin /status /refetch /stats; students still get today's menu", async () => {
    const fetchedAt = Date.parse("2026-09-05T00:12:00.000Z");
    const attemptedAt = Date.parse("2026-09-05T02:30:00.000Z");
    const status = toAdminStatus(
      "2026-09-05",
      { source: "live", dishes: [{}, {}, {}, {}, {}, {}], fetchedAt },
      { source: "no_info", dishes: [], fetchedAt: attemptedAt },
      [
        {
          cafeteria: "peony",
          status: "success",
          attemptedAt: fetchedAt,
        },
        {
          cafeteria: "peony",
          status: "success",
          attemptedAt: fetchedAt + 1,
        },
        {
          cafeteria: "peony",
          status: "success",
          attemptedAt: fetchedAt + 2,
        },
        {
          cafeteria: "azilea",
          status: "empty",
          attemptedAt,
          error: "empty parse; kept existing live menu",
        },
      ],
    );
    const menus = {
      peony: {
        dishes: [{ name: "비빔밥", description: "рис", spiciness: 1 }],
      },
      azilea: { dishes: [] },
    };
    const refetchResult = {
      date: "2026-09-05",
      results: {
        peony: { ok: true, dishCount: 6 },
        azilea: { ok: false, dishCount: 0, error: "HTTP 500 from x" },
      },
      telegramMessage: formatMenuMessage(menus.peony, menus.azilea),
    };

    await withMockTelegram(async (calls) => {
      const tracked: string[] = [];
      let refetchCalls = 0;
      const deps = {
        getTodayMenus: async () => menus,
        sendMessage,
        answerCallbackQuery,
        adminChatId: "99",
        aptabaseDashboardUrl: "https://app.aptabase.com/demo",
        getAdminStatus: async () => status,
        refetchToday: async () => {
          refetchCalls += 1;
          return refetchResult;
        },
        trackEvent: async (eventName: string) => {
          tracked.push(eventName);
        },
      };

      expect(await processTelegramUpdate(
        { message: { chat: { id: 99 }, text: "/status@daily_menu_dev_bot" } },
        deps,
      )).toBe("ok");
      expect(calls).toHaveLength(1);
      expect(calls[0].body.chat_id).toBe(99);
      expect(calls[0].body.text).toBe(formatAdminStatus(status));
      expect(calls[0].body.reply_markup).toBeUndefined();
      expect(tracked).toEqual([]);

      calls.length = 0;
      expect(await processTelegramUpdate(
        { message: { chat: { id: 99 }, text: "/refetch" } },
        deps,
      )).toBe("ok");
      expect(refetchCalls).toBe(1);
      expect(calls.map((c) => c.body.text)).toEqual([
        REFETCHING_MESSAGE,
        formatRefetchSummary(refetchResult.date, refetchResult.results),
        refetchResult.telegramMessage,
      ]);
      expect(tracked).toEqual([]);

      calls.length = 0;
      expect(await processTelegramUpdate(
        { message: { chat: { id: 99 }, text: "/stats" } },
        deps,
      )).toBe("ok");
      expect(calls[0].body.text).toBe("Analytics: https://app.aptabase.com/demo");

      calls.length = 0;
      expect(await processTelegramUpdate(
        { message: { chat: { id: 42 }, text: "/status" } },
        deps,
      )).toBe("ok");
      expect(calls[0].body.text).toBe(
        formatMenuMessage(menus.peony, menus.azilea),
      );
      expect(calls[0].body.reply_markup).toEqual(todayMenuKeyboard());
      expect(refetchCalls).toBe(1);
      expect(tracked).toEqual([EVENT_START]);

      calls.length = 0;
      expect(await processTelegramUpdate(
        { message: { chat: { id: 99 }, text: "hello" } },
        deps,
      )).toBe("ok");
      expect(calls[0].body.text).toBe(
        formatMenuMessage(menus.peony, menus.azilea),
      );
      expect(calls[0].body.reply_markup).toEqual(todayMenuKeyboard());
    });
  });

  it("admin /stats without a dashboard URL says the env var is unset", async () => {
    await withMockTelegram(async (calls) => {
      await processTelegramUpdate(
        { message: { chat: { id: 7 }, text: "/stats" } },
        {
          getTodayMenus: async () => ({ peony: null, azilea: null }),
          sendMessage,
          answerCallbackQuery,
          adminChatId: "7",
        },
      );
      expect(calls[0].body.text).toBe(STATS_UNSET_MESSAGE);
    });
  });

  it("claims a Telegram update_id so a redelivered /refetch scrapes once", async () => {
    const claimed = new Set<number>();
    let refetchCalls = 0;
    await withMockTelegram(async (calls) => {
      const deps = {
        getTodayMenus: async () => ({ peony: null, azilea: null }),
        sendMessage,
        answerCallbackQuery,
        adminChatId: "99",
        refetchToday: async () => {
          refetchCalls += 1;
          return {
            date: "2026-09-05",
            results: {
              peony: { ok: true, dishCount: 1 },
              azilea: { ok: true, dishCount: 1 },
            },
            telegramMessage: "menu",
          };
        },
        claimUpdateId: async (updateId: number) => {
          if (claimed.has(updateId)) return false;
          claimed.add(updateId);
          return true;
        },
      };
      const update = {
        update_id: 4242,
        message: { chat: { id: 99 }, text: "/refetch" },
      };
      expect(await processTelegramUpdate(update, deps)).toBe("ok");
      expect(await processTelegramUpdate(update, deps)).toBe("ok");
      expect(refetchCalls).toBe(1);
      expect(claimed.size).toBe(1);
      expect(calls.filter((c) => c.body.text === REFETCHING_MESSAGE)).toHaveLength(
        1,
      );
    });
  });

  it("treats every chat as a student when ADMIN_CHAT_ID is unset", async () => {
    let refetchCalls = 0;
    await withMockTelegram(async (calls) => {
      await processTelegramUpdate(
        { message: { chat: { id: 7 }, text: "/refetch" } },
        {
          getTodayMenus: async () => ({ peony: null, azilea: null }),
          sendMessage,
          answerCallbackQuery,
          refetchToday: async () => {
            refetchCalls += 1;
            throw new Error("should not refetch");
          },
        },
      );
      expect(refetchCalls).toBe(0);
      expect(calls[0].body.text).toBe(formatMenuMessage(null, null));
      expect(calls[0].body.reply_markup).toEqual(todayMenuKeyboard());
    });
  });

  it("still sends today's menu if trackEvent throws", async () => {
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
      expect(calls[0].body.text).toBe(formatMenuMessage(null, null));
      expect(calls[0].body.reply_markup).toEqual(todayMenuKeyboard());
    });
  });

  it("student message still tracks start when the menu fetch fails", async () => {
    const tracked: string[] = [];
    await withMockTelegram(async (calls) => {
      const result = await processTelegramUpdate(
        { message: { chat: { id: 9 }, text: "/start" } },
        {
          getTodayMenus: async () => {
            throw new Error("db down");
          },
          sendMessage,
          answerCallbackQuery,
          trackEvent: async (eventName) => {
            tracked.push(eventName);
          },
        },
      );
      expect(result).toBe("ok");
      expect(calls).toHaveLength(1);
      expect(calls[0].body.text).toBe(MENU_UNAVAILABLE_MESSAGE);
      expect(calls[0].body.reply_markup).toEqual(todayMenuKeyboard());
      expect(tracked).toEqual([EVENT_START]);
    });
  });

  it("opts in and out via the morning buttons; unsubscribe removes the next-day push", async () => {
    const chats = new Set<number>();
    const deps = {
      getTodayMenus: async () => ({ peony: null, azilea: null }),
      sendMessage,
      answerCallbackQuery,
      editMessageReplyMarkup,
      isSubscribed: async (chatId: number) => chats.has(chatId),
      subscribe: async (chatId: number) => {
        chats.add(chatId);
      },
      unsubscribe: async (chatId: number) => {
        chats.delete(chatId);
      },
    };

    await withMockTelegram(async (calls) => {
      await processTelegramUpdate(
        {
          callback_query: {
            id: "cb-sub",
            data: SUBSCRIBE_CALLBACK,
            message: { chat: { id: 42 }, message_id: 1001 },
          },
        },
        deps,
      );
      expect(chats.has(42)).toBe(true);
      expect(calls.map((c) => c.method)).toEqual([
        "answerCallbackQuery",
        "editMessageReplyMarkup",
      ]);
      expect(calls[0].body.callback_query_id).toBe("cb-sub");
      expect(calls[0].body.text).toBe(SUBSCRIBED_MESSAGE);
      expect(calls[1].body.chat_id).toBe(42);
      expect(calls[1].body.message_id).toBe(1001);
      expect(calls[1].body.reply_markup).toEqual(todayMenuKeyboard(true));
      expect(JSON.stringify(calls[1].body.reply_markup)).toContain(
        UNSUBSCRIBE_BUTTON_LABEL,
      );
      expect(JSON.stringify(calls[1].body.reply_markup)).toContain(
        UNSUBSCRIBE_CALLBACK,
      );

      calls.length = 0;
      await processTelegramUpdate(
        { message: { chat: { id: 42 }, text: "hi" } },
        deps,
      );
      expect(calls[0].method).toBe("sendMessage");
      expect(calls[0].body.reply_markup).toEqual(todayMenuKeyboard(true));

      calls.length = 0;
      await processTelegramUpdate(
        {
          callback_query: {
            id: "cb-unsub",
            data: UNSUBSCRIBE_CALLBACK,
            message: { chat: { id: 42 }, message_id: 1001 },
          },
        },
        deps,
      );
      expect(chats.has(42)).toBe(false);
      expect(calls.map((c) => c.method)).toEqual([
        "answerCallbackQuery",
        "editMessageReplyMarkup",
      ]);
      expect(calls[0].body.text).toBe(UNSUBSCRIBED_MESSAGE);
      expect(calls[1].body.reply_markup).toEqual(todayMenuKeyboard(false));
      expect(JSON.stringify(calls[1].body.reply_markup)).toContain(
        SUBSCRIBE_BUTTON_LABEL,
      );
    });
  });

  it("subscribe/unsubscribe errors toast without a new message or prefs lookup", async () => {
    await withMockTelegram(async (calls) => {
      await processTelegramUpdate(
        {
          callback_query: {
            id: "cb-sub-fail",
            data: SUBSCRIBE_CALLBACK,
            message: { chat: { id: 7 }, message_id: 9 },
          },
        },
        {
          getTodayMenus: async () => ({ peony: null, azilea: null }),
          sendMessage,
          answerCallbackQuery,
          editMessageReplyMarkup,
          isSubscribed: async () => {
            throw new Error("prefs lookup should not run");
          },
          subscribe: async () => {
            throw new Error("db down");
          },
        },
      );
      expect(calls.map((c) => c.method)).toEqual(["answerCallbackQuery"]);
      expect(String(calls[0].body.text)).toBe(SUBSCRIBE_FAILED_MESSAGE);

      calls.length = 0;
      await processTelegramUpdate(
        {
          callback_query: {
            id: "cb-unsub-fail",
            data: UNSUBSCRIBE_CALLBACK,
            message: { chat: { id: 7 }, message_id: 9 },
          },
        },
        {
          getTodayMenus: async () => ({ peony: null, azilea: null }),
          sendMessage,
          answerCallbackQuery,
          editMessageReplyMarkup,
          isSubscribed: async () => {
            throw new Error("prefs lookup should not run");
          },
          unsubscribe: async () => {
            throw new Error("db down");
          },
        },
      );
      expect(calls.map((c) => c.method)).toEqual(["answerCallbackQuery"]);
      expect(String(calls[0].body.text)).toBe(UNSUBSCRIBE_FAILED_MESSAGE);
    });
  });

  it("toasts subscribe without editing when the callback has no message_id", async () => {
    await withMockTelegram(async (calls) => {
      await processTelegramUpdate(
        {
          callback_query: {
            id: "cb-sub-no-mid",
            data: SUBSCRIBE_CALLBACK,
            message: { chat: { id: 42 } },
          },
        },
        {
          getTodayMenus: async () => ({ peony: null, azilea: null }),
          sendMessage,
          answerCallbackQuery,
          editMessageReplyMarkup,
          subscribe: async () => undefined,
        },
      );
      expect(calls.map((c) => c.method)).toEqual(["answerCallbackQuery"]);
      expect(calls[0].body.text).toBe(SUBSCRIBED_MESSAGE);
    });
  });

  it("still toasts and skips extra text when the keyboard cannot be edited", async () => {
    await withMockTelegram(
      async (calls) => {
        await processTelegramUpdate(
          {
            callback_query: {
              id: "cb-sub-stale",
              data: SUBSCRIBE_CALLBACK,
              message: { chat: { id: 42 }, message_id: 77 },
            },
          },
          {
            getTodayMenus: async () => ({ peony: null, azilea: null }),
            sendMessage,
            answerCallbackQuery,
            editMessageReplyMarkup,
            subscribe: async () => undefined,
          },
        );
        expect(calls.map((c) => c.method)).toEqual([
          "answerCallbackQuery",
          "editMessageReplyMarkup",
        ]);
        expect(calls[0].body.text).toBe(SUBSCRIBED_MESSAGE);
        expect(calls.some((c) => c.method === "sendMessage")).toBe(false);
      },
      {
        respond: (call) => {
          if (call.method === "editMessageReplyMarkup") {
            return {
              status: 400,
              body: { ok: false, description: "message can't be edited" },
            };
          }
          return { status: 200, body: { ok: true } };
        },
      },
    );
  });
});

describe("morning push", () => {
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
  const stub = {
    source: "live" as const,
    dishes: [{ name: "오므라이스" }],
    fetchedAt: 1,
  };
  const notice = {
    source: "live" as const,
    dishes: [{ name: "추석 연휴 휴무" }],
    fetchedAt: 1,
  };
  const noInfo = {
    source: "no_info" as const,
    dishes: [],
    fetchedAt: 1,
  };
  const monday = "2026-09-07";
  const saturday = "2026-09-05";

  it("maps KST calendar dates to weekdays", () => {
    expect(weekdayFromYmd(saturday)).toBe(6);
    expect(weekdayFromYmd("2026-09-06")).toBe(0);
    expect(weekdayFromYmd(monday)).toBe(1);
    expect(isKstWeekend(saturday)).toBe(true);
    expect(isKstWeekend(monday)).toBe(false);
  });

  it("pushes only when both halls are settled on weekdays", () => {
    expect(isPushableFoodMenu(tray)).toBe(true);
    expect(isPushableFoodMenu(stub)).toBe(false);
    expect(isPushableFoodMenu(notice)).toBe(false);
    expect(isPushableFoodMenu(noInfo)).toBe(false);
    expect(
      shouldSendMorningPush({ today: monday, peony: tray, azilea: tray }),
    ).toBe(true);
    expect(
      shouldSendMorningPush({ today: monday, peony: tray, azilea: stub }),
    ).toBe(false);
    expect(
      shouldSendMorningPush({ today: monday, peony: stub, azilea: tray }),
    ).toBe(false);
    expect(
      shouldSendMorningPush({ today: monday, peony: tray, azilea: notice }),
    ).toBe(true);
    expect(
      shouldSendMorningPush({ today: monday, peony: notice, azilea: tray }),
    ).toBe(true);
    expect(
      shouldSendMorningPush({ today: monday, peony: notice, azilea: noInfo }),
    ).toBe(false);
    expect(
      shouldSendMorningPush({ today: monday, peony: stub, azilea: stub }),
    ).toBe(false);
    expect(
      shouldSendMorningPush({ today: monday, peony: notice, azilea: notice }),
    ).toBe(false);
    expect(
      shouldSendMorningPush({ today: saturday, peony: tray, azilea: tray }),
    ).toBe(false);
  });

  it("does not treat 5+ as a combined count across halls", () => {
    const three = {
      source: "live" as const,
      dishes: [{ name: "A" }, { name: "B" }, { name: "C" }],
      fetchedAt: 1,
    };
    expect(
      shouldSendMorningPush({ today: monday, peony: three, azilea: three }),
    ).toBe(false);
  });

  it("on the last attempt sends even if one hall is empty", () => {
    expect(
      shouldSendMorningPush({
        today: monday,
        peony: tray,
        azilea: noInfo,
        lastAttempt: true,
      }),
    ).toBe(true);
    expect(
      shouldSendMorningPush({
        today: monday,
        peony: tray,
        azilea: stub,
        lastAttempt: true,
      }),
    ).toBe(true);
    expect(
      shouldSendMorningPush({
        today: monday,
        peony: noInfo,
        azilea: tray,
        lastAttempt: true,
      }),
    ).toBe(true);
    expect(
      shouldSendMorningPush({
        today: monday,
        peony: noInfo,
        azilea: noInfo,
        lastAttempt: true,
      }),
    ).toBe(false);
    expect(
      shouldSendMorningPush({
        today: saturday,
        peony: tray,
        azilea: noInfo,
        lastAttempt: true,
      }),
    ).toBe(false);
  });

  it("sends one menu per opted-in chat and keeps going after a failed send", async () => {
    const sent: number[] = [];
    const dropped: number[] = [];
    const marked: number[] = [];
    const summary = await deliverMorningPushes({
      today: monday,
      peony: tray,
      azilea: tray,
      menuText: "menu",
      subscribers: [
        { chatId: 1 },
        { chatId: 2, lastPushedDate: monday },
        { chatId: 3 },
        { chatId: 4 },
      ],
      send: async (chatId) => {
        sent.push(chatId);
        if (chatId === 1) return { ok: false, blocked: true };
        if (chatId === 3) return { ok: false };
        return { ok: true };
      },
      markPushed: async (chatId) => {
        marked.push(chatId);
      },
      dropSubscriber: async (chatId) => {
        dropped.push(chatId);
      },
    });
    expect(sent).toEqual([1, 3, 4]);
    expect(dropped).toEqual([1]);
    expect(marked).toEqual([4]);
    expect(summary).toEqual({ sent: 1, failed: 1, skipped: 1, dropped: 1 });
  });

  it("does not send while either hall is still a stub", async () => {
    const send = vi.fn(async () => ({ ok: true }));
    const summary = await deliverMorningPushes({
      today: monday,
      peony: tray,
      azilea: stub,
      menuText: "partial",
      subscribers: [{ chatId: 1 }],
      send,
      markPushed: async () => undefined,
      dropSubscriber: async () => undefined,
    });
    expect(send).not.toHaveBeenCalled();
    expect(summary.sent).toBe(0);
  });

  it("sends on the last attempt even if one hall is empty", async () => {
    const send = vi.fn(async () => ({ ok: true }));
    const summary = await deliverMorningPushes({
      today: monday,
      peony: tray,
      azilea: noInfo,
      lastAttempt: true,
      menuText: "last try",
      subscribers: [{ chatId: 1 }],
      send,
      markPushed: async () => undefined,
      dropSubscriber: async () => undefined,
    });
    expect(send).toHaveBeenCalledTimes(1);
    expect(summary.sent).toBe(1);
  });

  it("does not send on a closed day even if chats are opted in", async () => {
    const send = vi.fn(async () => ({ ok: true }));
    const summary = await deliverMorningPushes({
      today: monday,
      peony: notice,
      azilea: noInfo,
      menuText: "closed",
      subscribers: [{ chatId: 1 }],
      send,
      markPushed: async () => undefined,
      dropSubscriber: async () => undefined,
    });
    expect(send).not.toHaveBeenCalled();
    expect(summary.sent).toBe(0);
  });

  it("treats Telegram 403 / blocked copy as a dropped chat", () => {
    expect(isBlockedTelegramError(403, "Forbidden: bot was blocked by the user")).toBe(
      true,
    );
    expect(isBlockedTelegramError(400, "Bad Request: chat not found")).toBe(true);
    expect(isBlockedTelegramError(400, "Bad Request: message is too long")).toBe(
      false,
    );
  });

  it("parses Telegram ok:false 403 from a 200 HTTP body", async () => {
    await withMockTelegram(
      async () => {
        const result = await sendMessageResult(99, "menu");
        expect(result.ok).toBe(false);
        expect(result.blocked).toBe(true);
        expect(result.status).toBe(403);
      },
      {
        respond: () => ({
          status: 200,
          body: {
            ok: false,
            error_code: 403,
            description: "Forbidden: bot was blocked by the user",
          },
        }),
      },
    );
  });

  it("hooks morning push from the fetch cron action", () => {
    const menus = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "../convex/menus.ts"),
      "utf8",
    );
    const fetchAll = menus.slice(
      menus.indexOf("export const fetchAllForToday"),
      menus.indexOf("export const refetchToday"),
    );
    expect(fetchAll).toContain("export const fetchAllForToday");
    expect(fetchAll.match(/await pushMorningMenu\(/g)).toHaveLength(2);
    expect(fetchAll.match(/internal\.morningPush\.pushIfReady/g)).toHaveLength(
      2,
    );
    expect(todayMenuKeyboard(false).inline_keyboard).toHaveLength(2);
    expect(todayMenuKeyboard(true).inline_keyboard[1][0].text).toBe(
      UNSUBSCRIBE_BUTTON_LABEL,
    );
  });
});
