import { parseHallPref, type HallPref } from "./halls";
import { DEFAULT_LOCALE, parseLocale, type Locale } from "./i18n";

export type ChatPrefsLocaleRow = { locale: string; halls?: string };

export type SetLocaleWrite =
  | {
      created: true;
      locale: Locale;
      insert: { locale: Locale; createdAt: number; updatedAt: number };
    }
  | {
      created: false;
      locale: Locale;
      patch: { locale: Locale; updatedAt: number };
    };

export type EnsureLocaleWrite =
  | {
      created: true;
      locale: Locale;
      insert: { locale: Locale; createdAt: number; updatedAt: number };
    }
  | { created: false; locale: Locale };

export type SetHallsWrite =
  | {
      created: true;
      halls: HallPref;
      insert: {
        locale: Locale;
        halls: HallPref;
        createdAt: number;
        updatedAt: number;
      };
    }
  | {
      created: false;
      halls: HallPref;
      patch: { halls: HallPref; updatedAt: number };
    };

/** Insert a prefs row when the chat has none; otherwise patch locale. */
export function setLocaleWrite(
  existing: ChatPrefsLocaleRow | null,
  locale: string,
  now: number,
): SetLocaleWrite {
  const parsed = parseLocale(locale);
  if (existing) {
    return {
      created: false,
      locale: parsed,
      patch: { locale: parsed, updatedAt: now },
    };
  }
  return {
    created: true,
    locale: parsed,
    insert: { locale: parsed, createdAt: now, updatedAt: now },
  };
}

/**
 * Missing row → insert fallback (Russian by default) so a send path never
 * uses an in-memory default without persisting it.
 */
export function ensureLocaleWrite(
  existing: ChatPrefsLocaleRow | null,
  fallback: string | undefined,
  now: number,
): EnsureLocaleWrite {
  if (existing) {
    return { created: false, locale: parseLocale(existing.locale) };
  }
  const locale = parseLocale(fallback ?? DEFAULT_LOCALE);
  return {
    created: true,
    locale,
    insert: { locale, createdAt: now, updatedAt: now },
  };
}

/** Insert a prefs row when the chat has none; otherwise patch halls. */
export function setHallsWrite(
  existing: ChatPrefsLocaleRow | null,
  halls: string,
  now: number,
): SetHallsWrite {
  const parsed = parseHallPref(halls);
  if (existing) {
    return {
      created: false,
      halls: parsed,
      patch: { halls: parsed, updatedAt: now },
    };
  }
  return {
    created: true,
    halls: parsed,
    insert: {
      locale: DEFAULT_LOCALE,
      halls: parsed,
      createdAt: now,
      updatedAt: now,
    },
  };
}
