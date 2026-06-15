# Widget playground (throwaway)

Manual visual proof for M5. **Not** shipped; M9 replaces this with the real
`examples/` Next.js host app + Playwright e2e.

## Run

1. Build the workspace packages the playground imports:
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
3. In another, start the page:
   ```bash
   pnpm --filter @airnauts/comments-playground dev
   ```
4. Open <http://localhost:5173/?comments-key=dev-key>. Without the key param the
   page is untouched (widget inert). With it: a **+ Comment** button appears,
   the first click prompts for your email, and placing a marker creates a thread
   you can see persist across a reload.
