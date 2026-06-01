# Next.js host app (M9 integration example)

A real Next.js App Router app that integrates the `@comments/*` packages through
their public seams. It is the worked example behind [`docs/integration.md`](../../docs/integration.md)
and the manual integration proof for M9.

## Run locally

1. Build the workspace packages it imports:
   ```bash
   pnpm --filter @comments/client --filter @comments/server \
     --filter @comments/adapter-mongo --filter @comments/storage-fs \
     --filter @comments/storage-vercel-blob build
   ```
2. Start the app (in-memory persistence, zero config):
   ```bash
   pnpm --filter @comments/nextjs-host dev
   ```
3. Open <http://localhost:3000/?comments-key=dev-key>. Without the `comments-key`
   param the page is untouched and the widget is inert.

Data is **in-memory and resets on restart**. To persist, set `MONGODB_URI` (and,
for uploads in production, `BLOB_READ_WRITE_TOKEN`) before starting — the server
module switches to MongoDB + Vercel Blob automatically. Uploads in the default
mode are written to a gitignored `public/uploads/` and served by Next.

## Manual smoke checklist

Run against `pnpm --filter @comments/nextjs-host dev`:

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
