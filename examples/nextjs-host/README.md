# Next.js host app

A complete Next.js App Router integration of the `@airnauts/airside-*` packages through
their public seams. It doubles as the Playwright e2e test host and the worked example
behind [`docs/integration.md`](../../docs/integration.md).

## Run locally

1. Build the workspace packages it imports:
   ```bash
   pnpm --filter @airnauts/airside-core \
     --filter @airnauts/airside-server \
     --filter @airnauts/airside-integration-next \
     --filter @airnauts/airside-client \
     --filter @airnauts/airside-adapter-memory \
     --filter @airnauts/airside-adapter-mongo \
     --filter @airnauts/airside-extension-email \
     --filter @airnauts/airside-extension-jira \
     --filter @airnauts/airside-extension-slack \
     --filter @airnauts/airside-storage-fs \
     --filter @airnauts/airside-storage-vercel-blob build
   ```
2. Start the app (in-memory persistence, zero config):
   ```bash
   pnpm --filter @airnauts/airside-nextjs-host dev
   ```
3. Open <http://localhost:3000/?airside-key=dev-key>. Without the `airside-key`
   param the page is untouched and the widget is inert.

Data is **in-memory and resets on restart**. To persist, set `MONGODB_URI` (and,
for uploads in production, `BLOB_READ_WRITE_TOKEN`) before starting — the server
module switches to MongoDB + Vercel Blob automatically. Uploads in the default
mode are written to a gitignored `public/uploads/` and served by Next.

## Manual smoke checklist

Run against `pnpm --filter @airnauts/airside-nextjs-host dev`:

1. Open `/` **without** the key → page untouched, widget inert.
2. Open `/?airside-key=dev-key` → comment affordance appears; the first action
   prompts for your email (remembered afterward).
3. **Element pin:** place a pin on the landing page → reload → it re-anchors.
4. **Text selection:** select a paragraph on `/article` → comment → reload → the
   highlight and pin persist.
5. **Re-anchor under mutation:** edit `app/pricing/page.tsx` (reorder or rename a
   `<tr>`) → reload → the pin re-anchors, or moves to **needs review / orphaned**
   when unfindable.
6. **Upload:** attach a screenshot to a comment → it renders (served from
   `public/uploads/`).
7. **Cross-page panel:** create threads on all three routes → open the panel → see
   them ordered by recent activity across pages → click one → it navigates to that
   page and focuses the pin; orphans appear in the needs-review section.
8. **Jira (optional):** set `JIRA_API_TOKEN`, `JIRA_SITE_URL`, `JIRA_EMAIL`, and
   `JIRA_PROJECT_KEY` → a **Create Jira issue** button appears in the thread toolbar;
   clicking it creates a linked issue and hides the button.
