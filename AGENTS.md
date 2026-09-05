# Agent Guidelines for daily-menu (Convex)

## Project tracking (Notion)
Issues and project notes live in Notion.
Read open issues and the [project page](https://app.notion.com/p/3d1252aaf7ec8126a3fed2445aebc5da), and update issue status (In progress / Done) as you go.

## Build & Test Commands
- Install: `npm install`
- Dev (codegen + sync): `npx convex dev`
- Deploy: `npx convex deploy`
- Test: `npm test` (Vitest; includes mock-Telegram button E2E)
- Typecheck: `npx tsc --noEmit` (after `npx convex codegen`)

## Code Style
- TypeScript, Convex query/mutation/action patterns
- All Convex functions are internal; the only public surface is `POST /telegram/webhook`
- `TELEGRAM_WEBHOOK_SECRET` is required; the webhook 401s if it is missing or wrong
- Separate Telegram bots for Convex **dev** and **prod** (one bot = one webhook). Register with `npx convex run telegram:setWebhook` (uses `CONVEX_SITE_URL`; do not paste URLs). `npx convex dev` does not change Telegram webhooks.
- Secrets in Convex env; cafeteria URLs in `appConfig` singleton (`key: "default"`)
- Telegram UX: one inline button (`today_menu`) for today's menu
- Keep bot logic in `telegramHandlers.ts` so E2E can run without a live deploy
- Prune `menus` and `fetchAttempts` older than 30 days at 00:00 KST; never delete today's rows
- Product events go to Aptabase (`start`, `today_menu`, `scrape_ok` / `scrape_empty` / `scrape_error`). Optional `APTABASE_APP_KEY`; no-op if unset. Do not send `chatId` or menu text.
