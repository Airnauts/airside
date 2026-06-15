# @airnauts/comments-next

Next.js App and Pages Router integration for the [Airnauts commenting tool](https://github.com/Airnauts/commenting-tool). Wraps `createCommentsServer` and the Next.js handler glue into single one-call integrations: `createCommentsAppRoute(config)` for the App Router and `createCommentsPagesRoute(config)` for the Pages Router.

## Installation

```bash
pnpm add @airnauts/comments-next
# Plus a persistence adapter and storage adapter, e.g.:
pnpm add @airnauts/comments-adapter-mongo @airnauts/comments-storage-vercel-blob
```

## Quick start — App Router

Create a catch-all route handler at `app/api/comments/[...path]/route.ts`:

```ts
import { createCommentsAppRoute } from '@airnauts/comments-next'
import { mongoRepository } from '@airnauts/comments-adapter-mongo'
import { vercelBlobStorage } from '@airnauts/comments-storage-vercel-blob'

export const { GET, POST, PATCH, OPTIONS } = createCommentsAppRoute({
  secretKey: process.env.COMMENTS_SECRET!,
  projectId: 'my-app',
  allowedOrigins: ['https://my-app.example.com'],
  repository: mongoRepository({ uri: process.env.MONGODB_URI! }),
  storage: vercelBlobStorage({ token: process.env.BLOB_READ_WRITE_TOKEN! }),
})
```

For local development without a real database, swap in the in-memory adapter:

```ts
import { memoryRepository } from '@airnauts/comments-adapter-memory'
import { fileSystemStorage } from '@airnauts/comments-storage-fs'
import { join } from 'node:path'

export const { GET, POST, PATCH, OPTIONS } = createCommentsAppRoute({
  secretKey: 'dev-key',
  projectId: 'my-app',
  allowedOrigins: ['http://localhost:3000'],
  repository: memoryRepository(),
  storage: fileSystemStorage({ rootDir: join(process.cwd(), 'public', 'uploads'), baseUrl: '/uploads' }),
  rateLimit: false,
})
```

## Quick start — Pages Router

Create a catch-all API route at `pages/api/comments/[...path].ts`:

```ts
import { createCommentsPagesRoute } from '@airnauts/comments-next'
import { mongoRepository } from '@airnauts/comments-adapter-mongo'
import { vercelBlobStorage } from '@airnauts/comments-storage-vercel-blob'

// REQUIRED: Next reads this statically, so the helper can't set it. The comments
// API parses JSON/multipart itself, so the raw body must reach it unparsed.
export const config = { api: { bodyParser: false } }

export default createCommentsPagesRoute({
  secretKey: process.env.COMMENTS_SECRET!,
  projectId: 'my-app',
  allowedOrigins: ['https://my-app.example.com'],
  repository: mongoRepository({ uri: process.env.MONGODB_URI! }),
  storage: vercelBlobStorage({ token: process.env.BLOB_READ_WRITE_TOKEN! }),
})
```

A single default export handles every method — `server.handle` answers the CORS preflight (`OPTIONS`) internally. Keep this on the **Node runtime** (the default): the server uses `node:crypto`, `Buffer`, and Node-only database drivers; it cannot run on the Edge runtime.

## API reference

### `createCommentsAppRoute(config)`

Accepts all [`CreateCommentsServerOptions`](https://github.com/Airnauts/commenting-tool/blob/main/packages/server/README.md) from `@airnauts/comments-server`, plus:

| Option | Type | Description |
|---|---|---|
| `disabled` | `boolean` | When `true`, all handlers return `404` (useful for environment-gated deployments) |

Returns `{ GET, POST, PATCH, OPTIONS, server? }`:

- `GET`, `POST`, `PATCH`, `OPTIONS` — Next.js App Router route handlers; destructure and re-export directly.
- `server` — the underlying `CommentsServer` instance (absent when `disabled: true`); useful for server-side reads, additional custom routes, or integration tests.

### `createCommentsPagesRoute(config)`

Accepts the same options as `createCommentsAppRoute`. Returns a single Node.js API-route handler function (the Pages Router `default` export). The function carries `.server` (absent when `disabled: true`) for the same uses as the App Router variant.

**`export const config = { api: { bodyParser: false } }` is required** in the route module — Next reads it statically and the helper cannot set it for you. The comments API parses `application/json` and `multipart/form-data` bodies itself, so the raw body must reach it unparsed.

## Configuration / env vars

| Env var | Used by | Description |
|---|---|---|
| `COMMENTS_SECRET` | `secretKey` | Shared bearer token (required in production) |
| `MONGODB_URI` | `mongoRepository` | MongoDB Atlas connection string |
| `BLOB_READ_WRITE_TOKEN` | `vercelBlobStorage` | Vercel Blob token |

## Requirements

- Next.js ≥ 15 (App Router and Pages Router; Next 14 is supported at runtime)
- Node.js ≥ 18

## Related packages

- **`@airnauts/comments-client`** — widget to mount on the front end
- **`@airnauts/comments-server`** — lower-level server API (use this for non-Next.js frameworks)
- **`@airnauts/comments-adapter-mongo`** — MongoDB persistence
- **`@airnauts/comments-adapter-postgres`** — PostgreSQL persistence
- **`@airnauts/comments-adapter-memory`** — in-memory persistence (dev/tests)
- **`@airnauts/comments-storage-vercel-blob`** — Vercel Blob storage
- **`@airnauts/comments-storage-fs`** — filesystem storage

See the [integration guide](https://github.com/Airnauts/commenting-tool/blob/main/docs/integration.md) and `examples/nextjs-host` for a complete worked example.

## License

MIT © Airnauts
