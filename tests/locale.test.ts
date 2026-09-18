import { describe, expect, it } from "vitest";
import {
  DEFAULT_LOCALE,
  isLocale,
  localeCallback,
  localeFromCallback,
  parseLocale,
  t,
} from "../convex/i18n";
import { mergeEnrichedGloss } from "../convex/openrouter";
import { dishGloss } from "../convex/types";

describe("locale helpers", () => {
  it("parses known locales and falls back to ru", () => {
    expect(parseLocale("en")).toBe("en");
    expect(parseLocale("ru")).toBe("ru");
    expect(parseLocale("ko")).toBe(DEFAULT_LOCALE);
    expect(parseLocale(null)).toBe(DEFAULT_LOCALE);
    expect(isLocale("en")).toBe(true);
    expect(isLocale("ko")).toBe(false);
    expect(localeFromCallback(localeCallback("en"))).toBe("en");
    expect(localeFromCallback("today_menu")).toBe(null);
  });

  it("reads gloss by locale and never falls back across languages", () => {
    const dish = {
      name: "찜닭",
      spiciness: 2,
      gloss: { ru: "тушёная курица", en: "braised chicken" },
    };
    expect(dishGloss(dish, "ru")).toBe("тушёная курица");
    expect(dishGloss(dish, "en")).toBe("braised chicken");
    expect(dishGloss({ name: "찜닭", spiciness: 0, gloss: { ru: "кимчи" } }, "en")).toBe(
      "",
    );
    expect(
      dishGloss({ name: "찜닭", spiciness: 0, description: "тушёная курица" }, "ru"),
    ).toBe("тушёная курица");
    expect(
      dishGloss({ name: "찜닭", spiciness: 0, description: "тушёная курица" }, "en"),
    ).toBe("");
  });

  it("merges legacy description into gloss.ru", () => {
    expect(mergeEnrichedGloss({ description: "тушёная курица" })).toEqual({
      ru: "тушёная курица",
    });
    expect(
      mergeEnrichedGloss({
        gloss: { en: "braised chicken" },
        description: "тушёная курица",
      }),
    ).toEqual({ en: "braised chicken", ru: "тушёная курица" });
    expect(
      mergeEnrichedGloss({
        gloss: { ru: "кимчи", en: "kimchi" },
        description: "ignored",
      }),
    ).toEqual({ ru: "кимчи", en: "kimchi" });
  });

  it("keeps English hall copy on Hangul names", () => {
    expect(t("en").hallPeony).toBe("🌸 피오니 · 지운관");
    expect(t("en").hallAzilea).toBe("🌺 아질리아 · 창조관");
    expect(t("ru").hallPeony).toBe("🌸 Peony · верхняя");
    expect(t("ru").hallAzilea).toBe("🌺 Azilea · нижняя");
  });
});
