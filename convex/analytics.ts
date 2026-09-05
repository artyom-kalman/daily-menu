/**
 * Thin Aptabase client for product events.
 * No-op when APTABASE_APP_KEY is unset. Never throws; never logs menu text or chatId.
 */

export const EVENT_START = "start";
export const EVENT_TODAY_MENU = "today_menu";
export const EVENT_SCRAPE_OK = "scrape_ok";
export const EVENT_SCRAPE_EMPTY = "scrape_empty";
export const EVENT_SCRAPE_ERROR = "scrape_error";

export type AnalyticsEventName =
  | typeof EVENT_START
  | typeof EVENT_TODAY_MENU
  | typeof EVENT_SCRAPE_OK
  | typeof EVENT_SCRAPE_EMPTY
  | typeof EVENT_SCRAPE_ERROR;

export type AnalyticsProps = {
  cafeteria?: string;
  date?: string;
};

export type TrackEvent = (
  eventName: AnalyticsEventName,
  props?: AnalyticsProps,
) => Promise<void>;

export type ScrapeStatus = "success" | "empty" | "error";

export const APP_VERSION = "0.1.0";
export const SDK_VERSION = "daily-menu/0.1.0";

/** Convex cloud **dev** deployment (`artyom:daily-menu:dev/artyom`). Prod uses a different host. */
export const CONVEX_DEV_DEPLOYMENT_HOST = "enchanted-goshawk-667";

const HOSTS: Record<string, string> = {
  EU: "https://eu.aptabase.com",
  US: "https://us.aptabase.com",
  DEV: "http://localhost:3000",
};

export function scrapeEventForStatus(status: ScrapeStatus): AnalyticsEventName {
  if (status === "success") return EVENT_SCRAPE_OK;
  if (status === "empty") return EVENT_SCRAPE_EMPTY;
  return EVENT_SCRAPE_ERROR;
}

/** Aptabase App Key is `A-<region>-<id>` (EU / US / DEV / SH). */
export function hostFromAppKey(appKey: string): string | undefined {
  const parts = appKey.split("-");
  if (parts.length < 3 || parts[0] !== "A") return undefined;
  const region = parts[1];
  if (region === "SH") return undefined;
  return HOSTS[region];
}

/** Aptabase session id: unix seconds + 8 digits. */
export function newSessionId(nowMs: number = Date.now()): string {
  const epochSeconds = Math.floor(nowMs / 1000);
  const random = Math.floor(Math.random() * 100_000_000)
    .toString()
    .padStart(8, "0");
  return `${epochSeconds}${random}`;
}

export function analyticsPropsOf(
  props?: AnalyticsProps,
): Record<string, string> | undefined {
  if (!props) return undefined;
  const out: Record<string, string> = {};
  if (typeof props.cafeteria === "string" && props.cafeteria.length > 0) {
    out.cafeteria = props.cafeteria;
  }
  if (typeof props.date === "string" && props.date.length > 0) {
    out.date = props.date;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

export type AptabaseEvent = {
  timestamp: string;
  sessionId: string;
  eventName: AnalyticsEventName;
  systemProps: {
    locale: string;
    osName: string;
    osVersion: string;
    deviceModel: string;
    isDebug: boolean;
    appVersion: string;
    sdkVersion: string;
  };
  props?: Record<string, string>;
};

export function buildAptabaseEvent(args: {
  eventName: AnalyticsEventName;
  props?: AnalyticsProps;
  now?: Date;
  sessionId?: string;
  isDebug?: boolean;
  locale?: string;
}): AptabaseEvent {
  const now = args.now ?? new Date();
  const event: AptabaseEvent = {
    timestamp: now.toISOString(),
    sessionId: args.sessionId ?? newSessionId(now.getTime()),
    eventName: args.eventName,
    systemProps: {
      locale: args.locale ?? "ru",
      osName: "Telegram",
      osVersion: "Bot",
      deviceModel: "Bot",
      isDebug: args.isDebug ?? false,
      appVersion: APP_VERSION,
      sdkVersion: SDK_VERSION,
    },
  };
  const props = analyticsPropsOf(args.props);
  if (props) event.props = props;
  return event;
}

export type TrackAptabaseOptions = {
  appKey?: string;
  host?: string;
  isDebug?: boolean;
  fetchImpl?: typeof fetch;
  now?: Date;
  sessionId?: string;
};

export function resolveAptabaseHost(
  appKey: string,
  hostOverride?: string,
): string | undefined {
  if (hostOverride && hostOverride.length > 0) return hostOverride.replace(/\/$/, "");
  return hostFromAppKey(appKey);
}

/**
 * Aptabase Debug vs Release (`systemProps.isDebug`).
 * `CONVEX_DEPLOYMENT` is only set in the local CLI, not in Convex functions,
 * so cloud **dev** is detected from CONVEX_CLOUD_URL / CONVEX_SITE_URL.
 * `APTABASE_DEBUG=0` forces Release; `=1` forces Debug.
 */
export function isDebugFromEnv(
  env: NodeJS.Dict<string> = process.env,
): boolean {
  const flag = env.APTABASE_DEBUG;
  if (flag === "0" || flag === "false") return false;
  if (flag === "1" || flag === "true") return true;
  if ((env.CONVEX_DEPLOYMENT ?? "").startsWith("dev:")) return true;
  const cloud = env.CONVEX_CLOUD_URL ?? "";
  const site = env.CONVEX_SITE_URL ?? "";
  return (
    cloud.includes(CONVEX_DEV_DEPLOYMENT_HOST) ||
    site.includes(CONVEX_DEV_DEPLOYMENT_HOST)
  );
}

export async function trackAptabaseEvent(
  eventName: AnalyticsEventName,
  props?: AnalyticsProps,
  options: TrackAptabaseOptions = {},
): Promise<void> {
  const appKey = options.appKey ?? process.env.APTABASE_APP_KEY;
  if (!appKey) return;

  const host = resolveAptabaseHost(
    appKey,
    options.host ?? process.env.APTABASE_HOST,
  );
  if (!host) {
    console.warn("APTABASE_APP_KEY region is unknown; skipping event");
    return;
  }

  const event = buildAptabaseEvent({
    eventName,
    props,
    now: options.now,
    sessionId: options.sessionId,
    isDebug: options.isDebug ?? isDebugFromEnv(),
  });

  const fetchImpl = options.fetchImpl ?? fetch;
  try {
    const res = await fetchImpl(`${host}/api/v0/events`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "App-Key": appKey,
      },
      body: JSON.stringify([event]),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.warn(`Aptabase HTTP ${res.status}: ${text.slice(0, 200)}`);
    }
  } catch (err) {
    console.warn(`Aptabase track failed: ${(err as Error).message}`);
  }
}
