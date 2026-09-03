import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { describe, expect, it } from "vitest";
import { formatMenuMessage } from "../convex/format";
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
    expect(text).toContain("Сегодня выходной");
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
