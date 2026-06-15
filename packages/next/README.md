# @airnauts/comments-next

Next.js App Router integration for the [Airnauts commenting tool](https://github.com/Airnauts/commenting-tool). Wraps `createCommentsServer` and `createNextHandler` into a single `createCommentsRoute(config)` call.

## Installation

```bash
pnpm add @airnauts/comments-next
# Plus a persistence adapter and storage adapter, e.g.:
pnpm add @airnauts/comments-adapter-mongo @airnauts/comments-storage-vercel-blob
```

## Quick start

Create a catch-all route handler at `app/api/comments/[...path]/route.ts`:

```ts
import { createCommentsRoute } from '@airnauts/comments-next'
import { mongoRepository } from '@airnauts/comments-adapter-mongo'
import { vercelBlobStorage } from '@airnauts/comments-storage-vercel-blob'

export const { GET, POST, PATCH, OPTIONS } = createCommentsRoute({
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

export const { GET, POST, PATCH, OPTIONS } = createCommentsRoute({
  secretKey: 'dev-key',
  projectId: 'my-app',
  allowedOrigins: ['http://localhost:3000'],
  repository: memoryRepository(),
  storage: fileSystemStorage({ rootDir: join(process.cwd(), 'public', 'uploads'), baseUrl: '/uploads' }),
  rateLimit: false,
})
```

## API reference

### `createCommentsRoute(config)`

Accepts all [`CreateCommentsServerOptions`](https://github.com/Airnauts/commenting-tool/blob/main/packages/server/README.md) from `@airnauts/comments-server`, plus:

| Option | Type | Description |
|---|---|---|
| `disabled` | `boolean` | When `true`, all handlers return `404` (useful for environment-gated deployments) |

Returns `{ GET, POST, PATCH, OPTIONS, server? }`:

- `GET`, `POST`, `PATCH`, `OPTIONS` — Next.js App Router route handlers; destructure and re-export directly.
- `server` — the underlying `CommentsServer` instance (absent when `disabled: true`); useful for server-side reads, additional custom routes, or integration tests.

## Configuration / env vars

| Env var | Used by | Description |
|---|---|---|
| `COMMENTS_SECRET` | `secretKey` | Shared bearer token (required in production) |
| `MONGODB_URI` | `mongoRepository` | MongoDB Atlas connection string |
| `BLOB_READ_WRITE_TOKEN` | `vercelBlobStorage` | Vercel Blob token |

## Requirements

- Next.js ≥ 15 (App Router; Next 14 is supported at runtime)
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
