# Deploying the comments backend — Vercel + MongoDB Atlas + Vercel Blob

The v1 reference deployment (architecture §2; ADR-0001, ADR-0003). It mounts
`@comments/server` in a Next.js App Router app, persists to MongoDB Atlas via
`@comments/adapter-mongo`, and stores image uploads in Vercel Blob.

> Scope: this is the **deploy-ready recipe**. The full widget host app, the
> Playwright E2E, and the dogfood deployment are M9.

## 1. Provision

- **MongoDB Atlas** — create a cluster + database user; copy the
  `mongodb+srv://…` connection string. The Atlas ↔ Vercel native integration can
  inject it for you; otherwise set `MONGODB_URI` yourself (next step).
- **Vercel Blob** — create a Blob store; it exposes a `BLOB_READ_WRITE_TOKEN`.

## 2. Environment variables (Vercel → Project → Settings → Environment Variables)

| Var | Purpose |
|---|---|
| `MONGODB_URI` | Atlas connection string |
| `COMMENTS_DB_NAME` | database name (e.g. `comments`) |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob token (read automatically by `@vercel/blob`) |
| `COMMENTS_SECRET_KEY` | the capability key — the value the widget sends |
| `COMMENTS_ALLOWED_ORIGINS` | comma-separated origin allowlist |

## 3. Connect once, reuse across invocations

Serverless functions reuse module scope across warm invocations, so create the
`MongoClient` **once at module load** (never per request) and run `ensureIndexes`
once.

```ts
// lib/comments.ts
import { createCommentsServer } from '@comments/server'
import { createMongoRepository, ensureIndexes } from '@comments/adapter-mongo'
import { VercelBlobStorage } from '@comments/storage-vercel-blob'
import { MongoClient } from 'mongodb'

const client = new MongoClient(process.env.MONGODB_URI!)
const dbReady = (async () => {
  await client.connect()
  const db = client.db(process.env.COMMENTS_DB_NAME)
  await ensureIndexes(db)
  return db
})()

export async function getServer() {
  const db = await dbReady
  return createCommentsServer({
    secretKey: process.env.COMMENTS_SECRET_KEY!,
    projectId: 'default', // v1: one project per mount (architecture §5)
    allowedOrigins: (process.env.COMMENTS_ALLOWED_ORIGINS ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    repository: createMongoRepository({ db }),
    storage: new VercelBlobStorage(),
  })
}
```

## 4. Mount the route (one line)

```ts
// app/api/comments/[...path]/route.ts
import { createNextHandler } from '@comments/server/next'
import { getServer } from '@/lib/comments'

const server = await getServer() // top-level await (ESM route module)
export const { GET, POST, PATCH, OPTIONS } = createNextHandler(server)
```

If you'd rather avoid top-level await, resolve `getServer()` inside each handler
and forward the request to its `.handle`.

## 5. Verify the round-trip

```bash
curl -i -X POST https://YOUR_APP/api/comments/threads \
  -H "x-comments-key: $COMMENTS_SECRET_KEY" \
  -H "origin: https://YOUR_APP" \
  -H 'content-type: application/json' \
  -d '{
    "pageUrl": "https://YOUR_APP/",
    "anchor": { "schemaVersion": 1, "selectors": ["body", "body"],
      "signals": { "tag": "body", "classes": [], "siblingIndex": 0, "ancestorTrail": [] },
      "offset": { "fx": 0.5, "fy": 0.5 } },
    "comment": { "text": "hello" },
    "author": { "email": "a@b.c", "name": "A" },
    "captureContext": { "viewportW": 1440, "viewportH": 900, "devicePixelRatio": 2, "userAgent": "curl" }
  }'
```

A `201` with a thread `id` confirms the stack. The same loop runs locally against
`mongodb-memory-server` in `packages/adapter-mongo/src/integration.test.ts`.
