# Agent Guidelines for daily-menu (Convex)

## Build & Test Commands
- Install: `npm install`
- Dev (codegen + sync): `npx convex dev`
- Deploy: `npx convex deploy`
- Test: `npm test` (Vitest; includes mock-Telegram button E2E)
- Typecheck: `npx tsc --noEmit` (after `npx convex codegen`)

## Code Style
- TypeScript, Convex query/mutation/action patterns
- Secrets in Convex env; cafeteria URLs in `appConfig` singleton (`key: "default"`)
- Telegram UX: one inline button (`today_menu`) for today's menu
- Keep bot logic in `telegramHandlers.ts` so E2E can run without a live deploy
