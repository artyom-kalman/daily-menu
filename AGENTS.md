# Agent Guidelines for daily-menu (Convex)

## Project tracking (Notion)
Issues and project notes live in Notion.
Read open issues and the [project page](https://app.notion.com/p/3d1252aaf7ec8126a3fed2445aebc5da), and update issue status (In progress / Done) as you go.

## Build & Test Commands
- Install: `npm install`
- Dev (codegen + watch): `npx convex dev`
- Deploy to Convex **dev** (`enchanted-goshawk-667`): `npx convex deploy --yes` with the **dev** `CONVEX_DEPLOY_KEY` (prefix `dev:enchanted-goshawk-667`). Never pass `--prod` from a feature branch.
- Production deploy is CI only (push to `master`). Do not `npx convex deploy --prod` from an agent.
- Test: `npm test` (Vitest; includes mock-Telegram button E2E)
- Typecheck: `npx tsc --noEmit` (after `npx convex codegen`)

## Real-env testing (required)
Vitest is not enough for Telegram UX. After the code is ready, **deploy to Convex dev and exercise the real dev bot** before calling the work done.

- Cloud agents have `CONVEX_DEPLOY_KEY` for **dev** (`enchanted-goshawk-667`). Use that. It is not the production key.
- Prefer `npx convex deploy --yes`. `npx convex dev --once` often fails on this key (`deployment:logs:view` is missing).
- `npx convex deploy` / `npx convex dev` do **not** change Telegram webhooks. Do not run `telegram:setWebhook` unless asked.
- Confirm on the **dev** bot (not prod): new buttons, copy, opt-in/out, admin commands if they changed.
- If the deploy key is missing or is a prod key, stop and say so. Do not guess.

## Code Style
- TypeScript, Convex query/mutation/action patterns
- All Convex functions are internal; the only public surface is `POST /telegram/webhook`
- `TELEGRAM_WEBHOOK_SECRET` is required; the webhook 401s if it is missing or wrong
- Separate Telegram bots for Convex **dev** and **prod** (one bot = one webhook). Register with `npx convex run telegram:setWebhook` (uses `CONVEX_SITE_URL`; do not paste URLs). `npx convex dev` does not change Telegram webhooks.
- Secrets in Convex env; cafeteria URLs in `appConfig` singleton (`key: "default"`)
- Telegram UX: two inline buttons — `today_menu` and morning `Присылать утром` / `Отписаться`. No student commands.
- Admin commands (`/status`, `/refetch`, `/stats`) only for `ADMIN_CHAT_ID`; everyone else gets today's menu with the two buttons. `/stats` sends `APTABASE_DASHBOARD_URL`
- Keep bot logic in `telegramHandlers.ts` so E2E can run without a live deploy
- Prune `menus` and `fetchAttempts` older than 30 days at 00:00 KST; never delete today's rows. `subscribers` are dropped on unsubscribe or blocked-chat delivery.
- Morning push: after a weekday cron fetch when **both** cafeterias are settled (each has its own complete live tray of 5+ dishes, or a closed/holiday notice). Do not push while either hall is still a stub, except on the last 12:30 KST attempt, which sends whatever is posted even if one hall is empty. Skip weekends and both-empty days. One message per opted-in chat. Store `chatId` in Convex only; never send it to Aptabase.
- Product events go to Aptabase (`start`, `today_menu`, `scrape_ok` / `scrape_empty` / `scrape_error`). Optional `APTABASE_APP_KEY`; no-op if unset. Do not send `chatId` or menu text. Convex **dev** (`enchanted-goshawk-667`) uses Aptabase Debug; prod uses Release.
