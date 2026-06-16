# Widget playground

Minimal local development sandbox for the `@airnauts/airside-client` widget. Runs an in-memory comments API on port 4321 and a Vite dev server on port 5173 — no database or cloud credentials needed.

## What this shows

- How to mount the widget with the vanilla `airside.init()` API
- How to run the server locally with `@airnauts/airside-server/dev` (`createDevServer`)
- How to wire `createMemoryRepository` for zero-config local testing

## Run

1. Build the workspace packages this playground imports:
   ```bash
   pnpm --filter @airnauts/airside-core \
     --filter @airnauts/airside-server \
     --filter @airnauts/airside-adapter-memory \
     --filter @airnauts/airside-client build
   ```
2. In one terminal, start the in-memory API:
   ```bash
   pnpm --filter @airnauts/airside-playground dev:server
   ```
3. In another terminal, start the page:
   ```bash
   pnpm --filter @airnauts/airside-playground dev
   ```
4. Open <http://localhost:5173/?airside-key=dev-key>. Without the `airside-key` param the widget is inert. With it: a **+ Comment** button appears; the first click prompts for your email; placing a marker creates a thread that persists across a reload.

## Packages used

| Package | Role |
|---|---|
| `@airnauts/airside-client` | Widget engine (`airside.init()`) |
| `@airnauts/airside-server` | HTTP handler (`createAirsideServer`) and dev server (`createDevServer`) |
| `@airnauts/airside-adapter-memory` | In-memory `Repository` |

For the full integration example with Next.js, MongoDB, Vercel Blob, Slack notifications, and Playwright e2e tests, see `examples/nextjs-host`.
