# @airnauts/airside-server

Server runtime for the [Airnauts commenting tool](https://github.com/Airnauts/airside): Web-standard `Request → Response` HTTP handler, use cases, CORS/security, and the adapter interfaces for persistence and storage.

## Installation

```bash
pnpm add @airnauts/airside-server
```

## Quick start

```ts
import { createAirsideServer } from '@airnauts/airside-server'
import { createMemoryRepository } from '@airnauts/airside-adapter-memory'
import { createFileSystemStorage } from '@airnauts/airside-storage-fs'

const server = createAirsideServer({
  secretKey: process.env.AIRSIDE_SECRET!,
  projectId: 'my-app',
  allowedOrigins: ['https://my-app.example.com'],
  repository: createMemoryRepository(),
  storage: createFileSystemStorage({ rootDir: './uploads', baseUrl: '/uploads' }),
})

// server.handle is a Web-standard (Request) => Promise<Response> handler.
// Mount it in any framework — Next.js, Hono, bare Node http, etc.
```

For Next.js (App Router or Pages Router), prefer `@airnauts/airside-next` which wraps the above into single one-call integrations: `createAirsideAppRoute(config)` for the App Router and `createAirsidePagesRoute(config)` for the Pages Router.

## API reference

### `createAirsideServer(options)`

Returns a `AirsideServer` with a single `handle(req: Request): Promise<Response>` method.

#### `CreateAirsideServerOptions`

| Option | Type | Required | Description |
|---|---|---|---|
| `secretKey` | `string` | ✓ | Shared bearer token; clients send it as `x-airside-key` |
| `projectId` | `string` | ✓ | Namespace for all threads in this mount |
| `allowedOrigins` | `string[]` | ✓ | CORS origin allowlist; requests from other origins get 403 |
| `repository` | `Repository` | ✓ | Persistence adapter (mongo, postgres, memory, …) |
| `storage` | `StorageAdapter` | ✓ | File/blob storage adapter |
| `env` | `string` | | Optional sub-namespace (e.g. `"staging"`) within a project |
| `extensions` | `ServerExtension[]` | | Notification and thread-action plugins; see below |
| `notifiers` | `Notifier[]` | | **Deprecated** — use `extensions` |
| `threadParam` | `string` | | URL param for thread deep-links (default `"airside-thread"`) |
| `rateLimit` | `RateLimitConfig \| false` | | Per-key/IP rate limit; default `{ writesPerMin: 60, readsPerMin: 600 }`; `false` disables |
| `rateLimiter` | `RateLimiter` | | Override the rate-limiter implementation |
| `uploads` | `{ maxBytes?: number }` | | Per-upload size cap (default 5 MB) |
| `extractIp` | `(req: Request) => string` | | Override IP extraction (default: first hop of `x-forwarded-for`) |

### Extensions (`ServerExtension`)

Extensions come in two kinds, both passed to `extensions: [...]`.

**Notification extensions** (`NotificationExtension`) receive a `NotificationEvent` after each write (thread created or comment added). Failures are isolated — they never break the write.

```ts
import { slackExtension } from '@airnauts/airside-extension-slack'
import { emailExtension } from '@airnauts/airside-extension-email'

createAirsideServer({
  // ...
  extensions: [
    ...slackExtension({ webhookUrl: process.env.SLACK_WEBHOOK! }),
    ...emailExtension({ transport, from: 'noreply@acme.com' }),
  ],
})
```

**Thread-action extensions** (`ThreadActionExtension`) add reviewer-triggered actions to the thread toolbar (e.g. "Create Jira issue"). Each action declares an `id`, `label`, `slot`, optional `visibleWhen` predicate, and a `run` handler that may persist an `externalLink` back on the thread.

```ts
import { jiraExtension } from '@airnauts/airside-extension-jira'

createAirsideServer({
  // ...
  extensions: jiraExtension({ siteUrl: '...', email: '...', apiToken: '...', projectKey: 'PROJ' }),
})
```

### Adapter interfaces

The types below are what custom adapters must implement:

```ts
import type { Repository, StorageAdapter } from '@airnauts/airside-server'
```

**`Repository`** — persistence; implement `createThread`, `getThread`, `listThreads`, `addComment`, `setStatus`, `updateAnchor`, `upsertExternalLink`, `putAttachment`, `getAttachments`.

**`StorageAdapter`** — file storage; implement `put(blob: PutBlob): Promise<PutResult>`.

Other exported types: `NewThread`, `NewComment`, `AnchorPatch`, `ListQuery`, `ListResult`, `Scope`, `PutBlob`, `PutResult`. Utility functions: `readAllBytes`, `sanitizeName`.

### `lazyRepository(connect, opts?)`

Wraps a `() => Promise<Repository>` factory so it connects lazily on first use and optionally memoizes the connection under a `cacheKey` (useful for hot-reload / warm serverless environments).

### Rate limiting

`InMemoryRateLimiter` is exported for use with the `rateLimiter` option or in tests. Implement the `RateLimiter` interface to plug in Redis or any other store.

### Error classes

`AuthInvalidKeyError`, `ConflictError`, `NotFoundError`, `OriginNotAllowedError`, `RateLimitedError`, `UploadTooLargeError`, `ValidationError`, `DomainError`, `IntegrationError`, `toResponse`.

## Subpath exports

### `@airnauts/airside-server/node`

Generic Node↔Web bridge for mounting the server on any Node host (Express, bare `node:http`, etc.). Usually consumed via `@airnauts/airside-next` for Next.js hosts.

```ts
import { nodeRequestToWeb, webToNode } from '@airnauts/airside-server/node'

// In an Express/http handler — bridge the Node req/res to the Web standard:
app.use('/api/comments', async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`)
  const webRes = await server.handle(await nodeRequestToWeb(req, url))
  await webToNode(webRes, res)
})
```

### `@airnauts/airside-server/dev`

Minimal Node `http` server that bridges Web `Request/Response` — for local development of non-Next.js consumers.

```ts
import { createDevServer } from '@airnauts/airside-server/dev'

const dev = createDevServer((req) => server.handle(req), { port: 4321 })
const { port } = await dev.listen()
// dev.close() to shut down
```

## Requirements

- Node.js ≥ 18 (Web `Request`/`Response` are built in)

## Related packages

- **`@airnauts/airside-next`** — one-call Next.js App and Pages Router integration (`createAirsideAppRoute` / `createAirsidePagesRoute`)
- **`@airnauts/airside-adapter-mongo`** — MongoDB repository
- **`@airnauts/airside-adapter-postgres`** — PostgreSQL repository
- **`@airnauts/airside-adapter-memory`** — in-memory repository for dev/tests
- **`@airnauts/airside-storage-vercel-blob`** — Vercel Blob storage
- **`@airnauts/airside-storage-fs`** — filesystem storage
- **`@airnauts/airside-extension-slack`** — Slack notification extension
- **`@airnauts/airside-extension-email`** — email notification extension
- **`@airnauts/airside-extension-jira`** — Jira thread-action extension
- **`@airnauts/airside-core`** — shared types and schemas (consumed transitively)

See [docs/architecture.md](https://github.com/Airnauts/airside/blob/main/docs/architecture.md) and the [integration guide](https://github.com/Airnauts/airside/blob/main/docs/integration.md).

## License

MIT © Airnauts
