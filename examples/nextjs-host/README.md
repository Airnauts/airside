# Next.js host app (M9 integration example)

A real Next.js App Router app that integrates the `@airnauts/comments-*` packages through
their public seams. It is the worked example behind [`docs/integration.md`](../../docs/integration.md)
and the manual integration proof for M9.

## Run locally

1. Build the workspace packages it imports:
   ```bash
   pnpm --filter @airnauts/comments-core \
     --filter @airnauts/comments-server \
     --filter @airnauts/comments-next \
     --filter @airnauts/comments-client \
     --filter @airnauts/comments-adapter-memory \
     --filter @airnauts/comments-adapter-mongo \
     --filter @airnauts/comments-integration-jira \
     --filter @airnauts/comments-notifier-slack \
     --filter @airnauts/comments-storage-fs \
     --filter @airnauts/comments-storage-vercel-blob build
   ```
2. Start the app (in-memory persistence, zero config):
   ```bash
   pnpm --filter @airnauts/comments-nextjs-host dev
   ```
3. Open <http://localhost:3000/?comments-key=dev-key>. Without the `comments-key`
   param the page is untouched and the widget is inert.

Data is **in-memory and resets on restart**. To persist, set `MONGODB_URI` (and,
for uploads in production, `BLOB_READ_WRITE_TOKEN`) before starting — the server
module switches to MongoDB + Vercel Blob automatically. Uploads in the default
mode are written to a gitignored `public/uploads/` and served by Next.

## Manual smoke checklist

Run against `pnpm --filter @airnauts/comments-nextjs-host dev`:

1. Open `/` **without** the key → page untouched, widget inert.
2. Open `/?comments-key=dev-key` → comment affordance appears; the first action
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
