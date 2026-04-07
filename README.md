# daily-menu

Convex backend that scrapes two Korean university cafeteria menus (Peony / Azilea), enriches each dish with a Russian description and spiciness rating via OpenRouter, and serves them through a stateless Telegram bot.

On any incoming Telegram message, the bot replies with today's menu for both cafeterias.

## Stack

- **Convex** — TypeScript backend (queries, mutations, actions, scheduled crons, HTTP actions).
- **OpenRouter** — LLM enrichment, defaults to a free model.
- **cheerio** — HTML parsing.
- **Telegram Bot API** — webhook delivered to a Convex `httpAction`.

## Layout

```
package.json
tsconfig.json
convex/
  schema.ts        tables: menus, fetchAttempts
  crons.ts         daily 06:00 KST fetch
  http.ts          /telegram/webhook route
  telegram.ts      webhook handler + send helpers
  menus.ts         scrape/enrich/persist orchestrator
  scraper.ts       fetch + cheerio parser
  openrouter.ts    LLM enrichment
  format.ts        Russian message formatter
  dates.ts         KST date helpers
  types.ts         shared types
```

## Setup

```bash
npm install
npx convex dev          # provisions a dev deployment
```

Set environment variables on the Convex deployment:

```bash
npx convex env set OPENROUTER_API_KEY ...
npx convex env set OPENROUTER_MODEL meta-llama/llama-3.3-70b-instruct:free
npx convex env set PEONY_URL ...
npx convex env set AZILEA_URL ...
npx convex env set TELEGRAM_BOT_TOKEN ...
npx convex env set TELEGRAM_WEBHOOK_SECRET "$(openssl rand -hex 32)"
npx convex env set ADMIN_CHAT_ID ...
```

Deploy:

```bash
npx convex deploy
```

Register the Telegram webhook once:

```bash
curl -F "url=https://<deployment>.convex.site/telegram/webhook" \
     -F "secret_token=$TELEGRAM_WEBHOOK_SECRET" \
     "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook"
```

## Manual checks

```bash
npx convex run menus:scrapeAndEnrich '{"cafeteria":"peony"}'
npx convex run menus:fetchAllForToday '{}'
```

## Schedule

- **06:00 KST (21:00 UTC)** — daily cron fetches both menus.
- If anything is missing or errored, the orchestrator reschedules itself every 30 minutes.
- **12:30 KST** — final cutoff. After this, the orchestrator alerts `ADMIN_CHAT_ID` and stops retrying for the day.
