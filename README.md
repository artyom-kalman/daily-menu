# daily-menu

Convex backend that scrapes two Korean university cafeteria menus (Peony / Azilea),
enriches each dish with a Russian description and spiciness rating via OpenRouter,
and serves them through a Telegram bot: «Сегодняшнее меню» plus an opt-in morning push.

## Stack

- **Convex** — TypeScript backend (queries, mutations, actions, crons, HTTP actions)
- **OpenRouter** — LLM enrichment
- **cheerio** — HTML parsing
- **Telegram Bot API** — webhook → Convex `httpAction`
- **Aptabase** — optional product events (button + scrape outcomes)

## Layout

```
convex/
  schema.ts            tables: appConfig, menus, fetchAttempts, telegramUpdates, subscribers
  appConfig.ts         singleton peonyUrl / azileaUrl
  crons.ts             daily 09:00 KST fetch; 00:00 KST prune
  prune.ts             delete menus / fetchAttempts older than 30 days
  prunePolicy.ts       retention cutoff (testable)
  morningPush.ts       fan-out to opted-in chats after a ready fetch
  morningPushPolicy.ts weekday / complete-tray gate (testable)
  subscribers.ts       opt-in rows; delete on unsubscribe or blocked chat
  http.ts              /telegram/webhook
  telegram.ts          webhook httpAction + setWebhook / getWebhookInfo
  telegramWebhook.ts   CONVEX_SITE_URL → Telegram setWebhook (testable)
  webhookAuth.ts       required TELEGRAM_WEBHOOK_SECRET check
  telegramHandlers.ts  buttons + admin-command bot logic (testable)
  analytics.ts         Aptabase events (testable; no-op without key)
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

1. User sends any message (e.g. `/start`) → bot replies with today's Peony + Azilea menu. **Сегодняшнее меню** and **Присылать утром** stay on that message.
2. User taps **Сегодняшнее меню** → the same formatted menu again (refresh, including stub trays). Peony + Azilea grouped by tray slot (горячее / суп / салат / ещё). No extra «Сегодня» line. Telegram HTML: bold names, italic gloss and section labels, compact chili. Staples bunch on one line. Both buttons stay on the menu.
3. **Присылать утром** stores that `chatId` in Convex. After a weekday scrape with at least one complete live tray, opted-in chats get the same menu once. **Отписаться** deletes the row (stops the next day). No student commands; no weekly reminder.

`ADMIN_CHAT_ID` can also use English admin commands (anyone else who types them still gets today's menu):

- `/status` — today's scrape health (source, dish count, last `fetchAttempts` row). No menu text.
- `/refetch` — force scrape both cafeterias, then send the outcome and the formatted menu.
- `/stats` — Aptabase dashboard URL from `APTABASE_DASHBOARD_URL` (or a not-set message).

## Config

**Secrets** (Convex env):

```bash
npx convex env set OPENROUTER_API_KEY ...
npx convex env set OPENROUTER_MODEL meta-llama/llama-3.3-70b-instruct:free
npx convex env set TELEGRAM_BOT_TOKEN ...          # this deployment's bot only
npx convex env set TELEGRAM_WEBHOOK_SECRET "$(openssl rand -hex 32)"  # required
npx convex env set ADMIN_CHAT_ID ...   # optional; enables /status /refetch /stats
npx convex env set APTABASE_APP_KEY A-EU-...   # optional product analytics
npx convex env set APTABASE_DASHBOARD_URL ...  # optional; /stats replies with this URL
```

`TELEGRAM_WEBHOOK_SECRET` is required. The webhook returns 401 if the env var is unset or the `x-telegram-bot-api-secret-token` header does not match.

**Dev and production must use different bot tokens.** One Telegram bot has one webhook; sharing `TELEGRAM_BOT_TOKEN` between Convex **dev** and **prod** steals updates. See [Dev vs production bots](#dev-vs-production-bots).

All Convex queries, mutations, and actions are **internal**. They are not callable from the public Convex HTTP API or a client. `npx convex run` still works because the CLI uses deploy credentials:

```bash
npx convex run appConfig:upsert '{ ... }'
npx convex run menus:seedToday '{ ... }'
npx convex run menus:refetchToday '{"force":true}'
npx convex run prune:pruneOldData
```

**Cafeteria URLs** live in the `appConfig` table (not env):

```bash
npx convex run appConfig:upsert '{
  "peonyUrl": "https://www.kbu.ac.kr/kor/CMS/DietMenuMgr/list.do?mCode=MN203&searchDietCategory=4",
  "azileaUrl": "https://www.kbu.ac.kr/kor/CMS/DietMenuMgr/list.do?mCode=MN203&searchDietCategory=5"
}'
```

Optional for local E2E against a mock Telegram server:

```bash
TELEGRAM_API_BASE=http://127.0.0.1:PORT
```

**Aptabase** (optional). If `APTABASE_APP_KEY` is unset, tracking is a no-op. Events: `start` (any student message), `today_menu` (button tap), `scrape_ok` / `scrape_empty` / `scrape_error` (with `cafeteria` + `date` props). No `chatId` or menu text is sent. Host is inferred from the key (`A-EU-…` / `A-US-…`); override with `APTABASE_HOST` for self-host.

Convex **dev** (`enchanted-goshawk-667`) sends Aptabase **Debug** events. Production sends **Release**. Override with `APTABASE_DEBUG=1` or `=0`. In the Aptabase dashboard, use the bug icon (top right) to view Debug data — it is separate from the Release dashboard.

## Setup

```bash
npm install
npx convex dev          # provisions a dev deployment + codegen
npx convex deploy
```

`npx convex dev` syncs functions to the **dev** deployment only. It does **not** call Telegram `setWebhook`, so the production bot keeps its webhook.

Register each bot's webhook with the helper (uses that deployment's `CONVEX_SITE_URL` — do not paste a URL):

```bash
npx convex run telegram:setWebhook           # Convex dev
npx convex run telegram:setWebhook --prod    # production
npx convex run telegram:getWebhookInfo       # confirm the URL
```

## Dev vs production bots

| Deployment | Telegram bot | Env + webhook |
| --- | --- | --- |
| Convex **prod** | existing production bot | `TELEGRAM_BOT_TOKEN` + `TELEGRAM_WEBHOOK_SECRET` on **prod** only |
| Convex **dev** | a second bot (e.g. `@daily_menu_dev_bot`) | same vars on the **dev** deployment only |

One-time ops for the **dev** bot:

1. In [@BotFather](https://t.me/BotFather), `/newbot` (name it something like `daily_menu_dev_bot`).
2. On the **dev** deployment only (default `npx convex env`, **not** `--prod`):

```bash
npx convex env set TELEGRAM_BOT_TOKEN "<dev bot token>"
npx convex env set TELEGRAM_WEBHOOK_SECRET "$(openssl rand -hex 32)"
npx convex env set ADMIN_CHAT_ID "<your chat id>"   # optional
npx convex env set APTABASE_APP_KEY "A-EU-..."      # optional; use a separate Aptabase app from prod
npx convex env set APTABASE_DASHBOARD_URL "https://app.aptabase.com/..."  # optional; /stats link
```

3. Point the **dev** bot at the **dev** HTTP site:

```bash
npx convex run telegram:setWebhook
npx convex run telegram:getWebhookInfo
```

The helper reads `CONVEX_SITE_URL` from the deployment you ran against, so the webhook URL cannot be the other environment's by mistake. Leave the production token and webhook untouched.

## GitHub Actions

`.github/workflows/ci.yml` runs tests on every pull request, then deploys to Convex production only when tests pass on a push to `master`.

One-time setup:

1. In the [Convex dashboard](https://dashboard.convex.dev), open the **production** deployment → **Settings → Deploy keys**, generate a key with `deployment:deploy`, and copy it.
2. In GitHub: **Settings → Environments → production → Add environment secret**:
   - Name: `CONVEX_DEPLOY_KEY`
   - Value: the production deploy key

   The deploy job uses `environment: production`, so this environment secret is available there and not to pull-request test jobs.

The deploy job runs `npx convex deploy --yes`, which uses `CONVEX_DEPLOY_KEY` to target production. Convex env secrets (`OPENROUTER_API_KEY`, `TELEGRAM_BOT_TOKEN`, …) stay in the Convex dashboard; they are not needed in GitHub Actions.

## Tests

Cloud-agent-friendly E2E (no Convex deploy / real Telegram required):

```bash
npm test
```

This spins up a mock Telegram HTTP API, drives `processTelegramUpdate` through
message → button → callback, and asserts the outbound `sendMessage` text.

Against a real deployment (deploy access + secrets required):

```bash
npx convex run menus:refetchToday '{"force":true}'
npx convex run menus:seedToday '{"peonyDishes":[{"name":"Test","description":"x","spiciness":0}],"azileaDishes":[]}'
# then POST a callback_query update to the webhook URL
# (must include header x-telegram-bot-api-secret-token)
```

## Schedule

- **09:00 KST (00:00 UTC)** — cron starts fetching both menus from `appConfig` URLs.
- Retries every **30 minutes** until a **complete** menu is found or **12:30 KST**. Fewer than **5** dishes (e.g. Azilea 오므라이스, or `잔치국수` + `추가밥`) is shown but not treated as ready — fetching continues. A closed/holiday notice is still final as one line. If the page is still empty at 12:30, the bot shows «Нет информации» (not a holiday).
- If the cafeteria posts a closed/holiday notice as a menu item, that text is shown as-is and fetching stops.
- Tapping **Сегодняшнее меню** re-fetches when there is still no complete live menu (empty, stub, or `no_info`).
- After a weekday fetch with at least one complete live tray, opted-in chats get that menu once (`subscribers.lastPushedDate`). Weekends, both-closed / `no_info` days, and stub trays are skipped. A failed send does not stop the rest of the batch; a blocked chat is dropped.
- **00:00 KST (15:00 UTC)** — prune `menus` and `fetchAttempts` older than **30 days**. Today’s rows are never deleted. Subscriber rows are not pruned; they are deleted on unsubscribe or blocked-chat delivery. Run `npx convex run prune:pruneOldData` to drain a backlog manually.
- Fetch errors retry until **12:30 KST**, then alert `ADMIN_CHAT_ID`.
