/** Supported UI locales. Dish gloss uses the same codes as map keys. */
export const LOCALES = ["ru", "en"] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "ru";

export function isLocale(value: string): value is Locale {
  return (LOCALES as readonly string[]).includes(value);
}

/** Unknown or empty stored values fall back to Russian. */
export function parseLocale(value: string | null | undefined): Locale {
  if (value && isLocale(value)) return value;
  return DEFAULT_LOCALE;
}

export function localeCallback(locale: Locale): string {
  return `locale_${locale}`;
}

export function localeFromCallback(data: string | undefined): Locale | null {
  if (!data?.startsWith("locale_")) return null;
  const code = data.slice("locale_".length);
  return isLocale(code) ? code : null;
}

export type UiStrings = {
  todayMenu: string;
  subscribe: string;
  unsubscribe: string;
  changeLanguage: string;
  localeName: string;
  subscribed: string;
  unsubscribed: string;
  subscribeFailed: string;
  unsubscribeFailed: string;
  menuUnavailable: string;
  menuNotReady: string;
  noMenuInfo: string;
  stillUpdating: string;
  courseHot: string;
  courseSoup: string;
  courseSalad: string;
  courseSide: string;
  hallPeony: string;
  hallAzilea: string;
  months: readonly [
    string,
    string,
    string,
    string,
    string,
    string,
    string,
    string,
    string,
    string,
    string,
    string,
  ];
};

export const UI: Record<Locale, UiStrings> = {
  ru: {
    todayMenu: "Сегодняшнее меню",
    subscribe: "Присылать утром",
    unsubscribe: "Отписаться",
    changeLanguage: "Сменить язык",
    localeName: "Русский",
    subscribed: "Буду присылать меню по утрам.",
    unsubscribed: "Больше не буду присылать утром.",
    subscribeFailed: "Не удалось подписаться. Попробуйте позже.",
    unsubscribeFailed: "Не удалось отписаться. Попробуйте позже.",
    menuUnavailable: "Не удалось получить меню. Попробуйте позже.",
    menuNotReady: "Меню ещё не выложили. Попробуйте позже.",
    noMenuInfo: "Нет информации",
    stillUpdating: "ещё обновляется",
    courseHot: "Горячее",
    courseSoup: "Суп",
    courseSalad: "Салат",
    courseSide: "Ещё",
    hallPeony: "🌸 Peony · верхняя",
    hallAzilea: "🌺 Azilea · нижняя",
    months: [
      "янв",
      "фев",
      "мар",
      "апр",
      "мая",
      "июн",
      "июл",
      "авг",
      "сен",
      "окт",
      "ноя",
      "дек",
    ],
  },
  en: {
    todayMenu: "Today's menu",
    subscribe: "Send in the morning",
    unsubscribe: "Unsubscribe",
    changeLanguage: "Change language",
    localeName: "English",
    subscribed: "I'll send the menu in the morning.",
    unsubscribed: "I won't send the morning menu anymore.",
    subscribeFailed: "Couldn't subscribe. Try again later.",
    unsubscribeFailed: "Couldn't unsubscribe. Try again later.",
    menuUnavailable: "Couldn't get the menu. Try again later.",
    menuNotReady: "Menu isn't posted yet. Try later.",
    noMenuInfo: "No information",
    stillUpdating: "still updating",
    courseHot: "Hot",
    courseSoup: "Soup",
    courseSalad: "Salad",
    courseSide: "More",
    hallPeony: "🌸 피오니 · 지운관",
    hallAzilea: "🌺 아질리아 · 창조관",
    months: [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ],
  },
};

export function t(locale: Locale): UiStrings {
  return UI[locale];
}

/** Neutral picker copy — shown before a locale exists. */
export const LANGUAGE_PROMPT = "Language / Язык";
