import { readFileSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { formatMenuMessage, NO_MENU_INFO } from "../convex/format";
import { looksLikeCafeteriaNotice } from "../convex/notices";
import { DEFAULT_MODEL } from "../convex/openrouter";
import {
  isFreshForServing,
  needsCronRetry,
  nextRetryDelayMs,
  sameDishNames,
} from "../convex/refreshPolicy";
import { parseMenuHtml, targetWeekdayIndex } from "../convex/scraper";
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

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

async function withMockTelegram<T>(
  run: (calls: Array<{ method: string; body: Record<string, unknown> }>) => Promise<T>,
): Promise<T> {
  const calls: Array<{ method: string; body: Record<string, unknown> }> = [];
  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const bodyText = await readBody(req);
    const body = bodyText ? (JSON.parse(bodyText) as Record<string, unknown>) : {};
    const url = req.url ?? "";
    // /bot<token>/<method>
    const method = url.split("/").pop() ?? "unknown";
    calls.push({ method, body });
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, result: true }));
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
});

describe("formatMenuMessage", () => {
  it("formats both cafeterias", () => {
    const text = formatMenuMessage(
      {
        dishes: [
          { name: "김치찌개", description: "острый суп", spiciness: 3 },
        ],
      },
      { dishes: [] },
    );
    expect(text).toContain("Peony");
    expect(text).toContain("Azilea");
    expect(text).toContain("김치찌개");
    expect(text).toContain(NO_MENU_INFO);
    expect(text).not.toContain("выходной");
  });

  it("shows a posted closed notice instead of no-info", () => {
    const text = formatMenuMessage(
      { dishes: [{ name: "추석 연휴 휴무", description: "", spiciness: 0 }] },
      null,
    );
    expect(text).toContain("추석 연휴 휴무");
    expect(text).toMatch(/Peony[\s\S]*추석 연휴 휴무[\s\S]*Azilea[\s\S]*Нет информации/);
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

      const deps = {
        getTodayMenus: async () => menus,
        sendMessage,
        answerCallbackQuery,
      };

      const start = await processTelegramUpdate(
        { message: { chat: { id: 42 }, text: "/start" } },
        deps,
      );
      expect(start).toBe("ok");
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
      expect(menuText).toContain("비빔밥");
      expect(menuText).toContain("된장찌개");
    });
  });
});
