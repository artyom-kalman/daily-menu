# daily-menu

Convex backend that scrapes two Korean university cafeteria menus (Peony / Azilea),
enriches each dish with a Russian description and spiciness rating via OpenRouter,
and serves them through a Telegram bot with **one button**: «Сегодняшнее меню».

## Stack

- **Convex** — TypeScript backend (queries, mutations, actions, crons, HTTP actions)
- **OpenRouter** — LLM enrichment
- **cheerio** — HTML parsing
- **Telegram Bot API** — webhook → Convex `httpAction`

## Layout

```
convex/
  schema.ts            tables: appConfig, menus, fetchAttempts
  appConfig.ts         singleton peonyUrl / azileaUrl
  crons.ts             daily 06:00 KST fetch
  http.ts              /telegram/webhook
  telegram.ts          webhook httpAction
  telegramHandlers.ts  one-button bot logic (testable)
  telegramClient.ts    Telegram API client (TELEGRAM_API_BASE overridable)
  menus.ts             scrape / enrich / seed
  scraper.ts           fetch + parse
  openrouter.ts        LLM enrichment
  format.ts            Russian message formatter
  dates.ts             KST helpers
  types.ts             shared types
tests/
  e2e-telegram.test.ts mock Telegram API + button flow
```

## Bot UX

1. User sends any message (e.g. `/start`) → bot replies with one inline button.
2. User taps **Сегодняшнее меню** → bot sends today's Peony + Azilea menus.

## Config

**Secrets** (Convex env):

```bash
npx convex env set OPENROUTER_API_KEY ...
npx convex env set OPENROUTER_MODEL meta-llama/llama-3.3-70b-instruct:free
npx convex env set TELEGRAM_BOT_TOKEN ...
npx convex env set TELEGRAM_WEBHOOK_SECRET "$(openssl rand -hex 32)"
npx convex env set ADMIN_CHAT_ID ...   # optional
```

**Cafeteria URLs** live in the `appConfig` table (not env):

```bash
npx convex run appConfig:upsert '{
  "peonyUrl": "https://example.com/peony",
  "azileaUrl": "https://example.com/azilea"
}'
```

Optional for local E2E against a mock Telegram server:

```bash
TELEGRAM_API_BASE=http://127.0.0.1:PORT
```

## Setup

```bash
npm install
npx convex dev          # provisions a dev deployment + codegen
npx convex deploy
```

Register the Telegram webhook once:

```bash
curl -F "url=https://<deployment>.convex.site/telegram/webhook" \
     -F "secret_token=$TELEGRAM_WEBHOOK_SECRET" \
     "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook"
```

## Tests

Cloud-agent-friendly E2E (no Convex deploy / real Telegram required):

```bash
npm test
```

This spins up a mock Telegram HTTP API, drives `processTelegramUpdate` through
message → button → callback, and asserts the outbound `sendMessage` text.

Against a real deployment (secrets required):

```bash
npx convex run menus:seedToday '{"peonyDishes":[{"name":"Test","description":"x","spiciness":0}],"azileaDishes":[]}'
# then POST a callback_query update to the webhook URL
```

## Schedule

- **06:00 KST (21:00 UTC)** — cron fetches both menus from `appConfig` URLs.
- Retries every 30 minutes until success or **12:30 KST**, then alerts `ADMIN_CHAT_ID`.
