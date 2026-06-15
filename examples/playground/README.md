# Widget playground

Minimal local development sandbox for the `@airnauts/comments-client` widget. Runs an in-memory comments API on port 4321 and a Vite dev server on port 5173 — no database or cloud credentials needed.

## What this shows

- How to mount the widget with the vanilla `comments.init()` API
- How to run the server locally with `@airnauts/comments-server/dev` (`createDevServer`)
- How to wire `memoryRepository` for zero-config local testing

## Run

1. Build the workspace packages this playground imports:
   ```bash
   pnpm --filter @airnauts/comments-core \
     --filter @airnauts/comments-server \
     --filter @airnauts/comments-adapter-memory \
     --filter @airnauts/comments-client build
   ```
2. In one terminal, start the in-memory API:
   ```bash
   pnpm --filter @airnauts/comments-playground dev:server
   ```
3. In another terminal, start the page:
   ```bash
   pnpm --filter @airnauts/comments-playground dev
   ```
4. Open <http://localhost:5173/?comments-key=dev-key>. Without the `comments-key` param the widget is inert. With it: a **+ Comment** button appears; the first click prompts for your email; placing a marker creates a thread that persists across a reload.

## Packages used

| Package | Role |
|---|---|
| `@airnauts/comments-client` | Widget engine (`comments.init()`) |
| `@airnauts/comments-server` | HTTP handler (`createCommentsServer`) and dev server (`createDevServer`) |
| `@airnauts/comments-adapter-memory` | In-memory `Repository` |

For the full integration example with Next.js, MongoDB, Vercel Blob, Slack notifications, and Playwright e2e tests, see `examples/nextjs-host`.
