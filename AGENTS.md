# Agent Guidelines for daily-menu (Convex)

## Project tracking (Notion)
Issues and project notes live in Notion, not GitHub Issues. Before planning or starting work, open **Side projects → daily-menu**, read open issues and the project page, and update issue status (In progress / Done) as you go.

- Hub: [Side projects](https://app.notion.com/p/3d1252aaf7ec8190a8efcbdd344b198f)
- This project: [daily-menu](https://app.notion.com/p/3d1252aaf7ec8126a3fed2445aebc5da)
- Issues board: [Issues](https://app.notion.com/p/315f27f5015a42dcac8ceb94d26b5c57)

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
