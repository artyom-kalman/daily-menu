import { describe, expect, it, vi } from "vitest";
import { formatMenuMessage, formatMenuUnavailable } from "../convex/format";
import { getCachedTodayMenus } from "../convex/menuServing";
import {
  processTelegramUpdate,
  TODAY_MENU_CALLBACK,
  todayMenuKeyboard,
} from "../convex/telegramHandlers";
import { t } from "../convex/i18n";

const nowMs = Date.parse("2026-11-13T04:00:00Z");
const date = "2026-11-13";
const tray = {
  date,
  source: "live" as const,
  fetchedAt: nowMs,
  dishes: ["김치찌개", "쌀밥", "생선까스", "깍두기", "요구르트"].map(
    (name) => ({ name, spiciness: 0 }),
  ),
};

describe("student menu outage fallback", () => {
  it.each(["ru", "en"] as const)(
    "gives %s students a friendly KBU link without internal errors",
    async (locale) => {
      const sendMessage = vi.fn(async () => true);
      await processTelegramUpdate(
        {
          callback_query: {
            id: "outage",
            data: TODAY_MENU_CALLBACK,
            message: { chat: { id: 42, type: "private" } },
          },
        },
        {
          getTodayMenus: async () => {
            throw new Error("The signal has been aborted");
          },
          sendMessage,
          answerCallbackQuery: async () => true,
          getLocale: async () => locale,
        },
      );
      const [chatId, text, options] = sendMessage.mock.calls[0] as unknown as [
        number,
        string,
        { reply_markup: unknown },
      ];
      expect(chatId).toBe(42);
      expect(text).toContain(t(locale).menuUnavailable);
      expect(text).toContain(
        '<a href="https://www.kbu.ac.kr/kor/CMS/DietMenuMgr/list.do?mCode=MN203">',
      );
      expect(text).not.toMatch(/aborted|attempts|12:30 KST/);
      expect(options.reply_markup).toEqual(todayMenuKeyboard(false, locale));
    },
  );

  it.each(["ru", "en"] as const)(
    "uses the same useful fallback for empty %s menus",
    async (locale) => {
      const sendMessage = vi.fn(async () => true);
      await processTelegramUpdate(
        { message: { chat: { id: 42, type: "private" }, text: "menu" } },
        {
          getTodayMenus: async () => ({ peony: null, azilea: { dishes: [] } }),
          sendMessage,
          answerCallbackQuery: async () => true,
          getLocale: async () => locale,
        },
      );
      expect(sendMessage).toHaveBeenCalledWith(
        42,
        formatMenuUnavailable(locale),
        { reply_markup: todayMenuKeyboard(false, locale) },
      );
    },
  );

  it("keeps the available hall and adds the missing hall's KBU link", () => {
    const text = formatMenuMessage(tray, null, { date, nowMs, locale: "en" });
    expect(text).toContain("<b>김치찌개</b>");
    expect(text).toContain(t("en").menuUnavailable);
    expect(text).toContain("searchDietCategory=5");
    expect(text).not.toContain("searchDietCategory=4");
  });

  it("serves the cached snapshot without waiting for a hanging background scrape", async () => {
    const scrape = vi.fn(() => new Promise<void>(() => {}));
    const scheduled: Array<() => Promise<void>> = [];
    const readToday = vi.fn(async () => ({ date, peony: tray, azilea: null }));
    const today = await getCachedTodayMenus({
      readToday,
      requestRefresh: async () => {
        scheduled.push(scrape);
      },
      nowMs,
    });
    expect(today.peony).toBe(tray);
    expect(today.azilea).toBeNull();
    expect(readToday).toHaveBeenCalledTimes(1);
    expect(scheduled).toEqual([scrape]);
    expect(scrape).not.toHaveBeenCalled();
  });

  it("preserves the cached hall when scheduling recovery fails", async () => {
    const today = await getCachedTodayMenus({
      readToday: async () => ({ date, peony: tray, azilea: null }),
      requestRefresh: async () => {
        throw new Error("scheduler unavailable");
      },
      nowMs,
    });
    expect(today.peony).toBe(tray);
    expect(today.azilea).toBeNull();
  });

  it("leaves complete cached menus and the empty morning cron window alone", async () => {
    const requestRefresh = vi.fn(async () => {});
    await getCachedTodayMenus({
      readToday: async () => ({ date, peony: tray, azilea: tray }),
      requestRefresh,
      nowMs,
    });
    await getCachedTodayMenus({
      readToday: async () => ({ date, peony: null, azilea: null }),
      requestRefresh,
      nowMs: Date.parse("2026-11-13T01:00:00Z"),
    });
    expect(requestRefresh).not.toHaveBeenCalled();
  });
});
