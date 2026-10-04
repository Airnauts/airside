<p align="center">
  <a href="https://github.com/Airnauts/airside">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/Airnauts/airside/main/assets/airside-logo-dark.svg">
      <img src="https://raw.githubusercontent.com/Airnauts/airside/main/assets/airside-logo-light.svg" alt="Airside" height="40">
    </picture>
  </a>
  <h1 align="center">
Embeddable Commenting Tool
</h1>
</p>

# @airnauts/airside-server

Server runtime for [Airside](https://github.com/Airnauts/airside): Web-standard `Request → Response` HTTP handler, use cases, CORS/security, and the adapter interfaces for persistence and storage.

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

For Next.js (App Router or Pages Router), prefer `@airnauts/airside-integration-next` which wraps the above into single one-call integrations: `createAirsideAppRoute(config)` for the App Router and `createAirsidePagesRoute(config)` for the Pages Router.

## API reference

### `createAirsideServer(options)`

Returns a `AirsideServer` with a single `handle(req: Request): Promise<Response>` method.

Handles the full HTTP contract: create thread, list threads, get thread, add comment (reply), resolve/reopen thread, **delete thread** (`DELETE /threads/:id`), report-orphan / refresh-anchor, run a registered thread action (e.g. `POST /threads/:id/actions/:actionId`), and upload attachment.

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

**Notification extensions** (`NotificationExtension`) receive a `NotificationEvent` after each write (thread created or comment added). Failures are isolated — they never break the write. `NotificationEvent.type` is typed as `NotificationEventType` (`'thread.created' | 'comment.added'`), also exported for custom extension authors.

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

**Thread-action extensions** (`ThreadActionExtension`) add reviewer-triggered actions to the thread toolbar (e.g. "Create Jira issue"). Each action declares a `provider`, `id`, `label`, `slot` (`'thread-toolbar' | 'thread-metadata' | 'panel-row-actions'`), an optional `presentation` for icon/style hints, an optional `visibleWhen` predicate, and a `run` handler that may persist an `externalLink` back on the thread.

```ts
import { jiraExtension } from '@airnauts/airside-extension-jira'

createAirsideServer({
  // ...
  extensions: [...jiraExtension({ siteUrl: '...', email: '...', apiToken: '...', projectKey: 'PROJ' })],
})
```

To implement a custom thread-action extension, import the context and result types:

```ts
import type {
  ActionVisibilityContext, // ctx passed to visibleWhen — thread base fields + scope
  ThreadActionContext,     // ctx passed to run       — full thread + scope
  ThreadActionResult,      // run return type: { externalLink? }
  ThreadActionExtension,
  ServerExtension,
} from '@airnauts/airside-server'

const myAction: ThreadActionExtension = {
  kind: 'thread-action',
  id: 'my-ext.doThing',
  provider: 'my-ext',
  label: 'Do thing',
  slot: 'thread-toolbar',
  presentation: { style: 'primary' },   // optional; icon?: string, style?: 'primary' | 'secondary' | 'link'
  visibleWhen: ({ thread }: ActionVisibilityContext) =>
    !thread.externalLinks?.some((l) => l.provider === 'my-ext'),
  run: async ({ thread, scope }: ThreadActionContext): Promise<ThreadActionResult> => {
    // call your service…
    return {
      externalLink: {
        provider: 'my-ext',
        externalId: 'ext-123',                // required: unique ID from the external system
        label: 'My Ext #123',
        url: 'https://ext.example.com/issues/123',
        createdAt: new Date().toISOString(),  // required ISO-8601 timestamp
      },
    }
  },
}
```

Throw `IntegrationError` (from `@airnauts/airside-server`) inside `run` to signal an upstream integration failure — the server maps it to a 502 and isolates it from the write.

### Adapter interfaces

The types below are what custom adapters must implement:

```ts
import type { Repository, StorageAdapter } from '@airnauts/airside-server'
```

**`Repository`** — persistence; implement `createThread`, `getThread`, `listThreads`, `addComment`, `setStatus`, `deleteThread`, `updateAnchor`, `upsertExternalLink`, `putAttachment`, `getAttachments`.

**`StorageAdapter`** — file storage; implement `put(blob: PutBlob): Promise<PutResult>`.

Other exported types: `NewThread`, `NewComment`, `AnchorPatch`, `ListQuery`, `ListResult`, `Scope`, `PutBlob`, `PutResult`. Utility functions: `readAllBytes`, `sanitizeName`.

Constant: `ALLOWED_UPLOAD_TYPES` — the tuple of accepted MIME types (`'image/png'`, `'image/jpeg'`, `'image/webp'`, `'image/gif'`). Useful for client-side file-type validation to match server enforcement.

### `lazyRepository(connect, opts?)`

Wraps a `() => Promise<Repository>` factory so it connects lazily on first use and optionally memoizes the connection under a `cacheKey` (useful for hot-reload / warm serverless environments).

### Rate limiting

`InMemoryRateLimiter` is exported for use with the `rateLimiter` option or in tests. Implement the `RateLimiter` interface to plug in Redis or any other store. The return type of `check()` is `CheckResult` (also exported): `{ ok: true } | { ok: false; retryAfterSec: number }`.

### Error classes

`AuthInvalidKeyError`, `ConflictError`, `NotFoundError`, `OriginNotAllowedError`, `RateLimitedError`, `UploadTooLargeError`, `ValidationError`, `DomainError`, `IntegrationError`, `toResponse`.

### `VERSION`

The package version string. Useful for runtime diagnostics.

### Cursor utilities (custom adapter authors)

Custom `Repository` implementations that support pagination can use these helpers to encode/decode the opaque cursor token that `listThreads` uses:

```ts
import { encodeCursor, decodeCursor } from '@airnauts/airside-server'

// encode: { updatedAt: string, id: string } → opaque base64url string
const cursor = encodeCursor({ updatedAt: row.updated_at.toISOString(), id: row.id })

// decode: opaque token → { updatedAt, id } | undefined (undefined on invalid input)
const payload = decodeCursor(token)
```

### Server context (advanced / testing)

The internal server context — useful when building deeply custom integrations, test helpers, or alternative server entrypoints:

```ts
import type { Ctx, CtxInit, IdFactory } from '@airnauts/airside-server'
import { makeCtx, defaultIds } from '@airnauts/airside-server'
```

| Export | Description |
|---|---|
| `Ctx` | Runtime server context (projectId, env, threadParam, now, ids) |
| `CtxInit` | Partial init shape accepted by `makeCtx` |
| `IdFactory` | Interface for the ID generators (`thread()`, `comment()`, `author()`, `attachment()`) |
| `defaultIds()` | Returns the default `IdFactory` (nanoid-based prefixed IDs) |
| `makeCtx(init)` | Builds a `Ctx` from a `CtxInit`, filling in defaults |

## Subpath exports

### `@airnauts/airside-server/node`

Generic Node↔Web bridge for mounting the server on any Node host (Express, bare `node:http`, etc.). Usually consumed via `@airnauts/airside-integration-next` for Next.js hosts.

```ts
import { nodeRequestToWeb, webToNode } from '@airnauts/airside-server/node'

// In an Express/http handler — bridge the Node req/res to the Web standard:
app.use('/api/airside', async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`)
  const webRes = await server.handle(await nodeRequestToWeb(req, url))
  await webToNode(webRes, res)
})
```

Exported symbols from `@airnauts/airside-server/node`:

| Export | Description |
|---|---|
| `nodeRequestToWeb(req, url)` | Convert a Node `IncomingMessage` to a Web `Request` |
| `webToNode(res, nodeRes)` | Write a Web `Response` back to a Node `ServerResponse` |
| `readBody(req)` | Read the request body into a `Uint8Array` (or `undefined` if there is no body) |
| `NodeRequestLike` | Type: `Pick<IncomingMessage, 'method' \| 'headers' \| 'on'>` |

### `@airnauts/airside-server/dev`

Minimal Node `http` server that bridges Web `Request/Response` — for local development of non-Next.js consumers.

```ts
import { createDevServer } from '@airnauts/airside-server/dev'

const dev = createDevServer((req) => server.handle(req), { port: 4321 })
const { port } = await dev.listen()
// dev.close() to shut down
```

Exported symbols from `@airnauts/airside-server/dev`:

| Export | Description |
|---|---|
| `createDevServer(handler, opts?)` | Create a dev server; `opts.port` defaults to `4321`. Returns a `DevServerHandle`. |
| `DevServerHandle` | Type: `{ listen(): Promise<{ port: number }>; close(): Promise<void> }` |

## Requirements

- Node.js ≥ 18 (Web `Request`/`Response` are built in)

## Related packages

- **`@airnauts/airside-integration-next`** — one-call Next.js App and Pages Router integration (`createAirsideAppRoute` / `createAirsidePagesRoute`)
- **`@airnauts/airside-adapter-mongo`** — MongoDB repository
- **`@airnauts/airside-adapter-postgres`** — PostgreSQL repository
- **`@airnauts/airside-adapter-memory`** — in-memory repository for dev/tests
- **`@airnauts/airside-storage-vercel-blob`** — Vercel Blob storage
- **`@airnauts/airside-storage-s3`** — Amazon S3 / Cloudflare R2 storage
- **`@airnauts/airside-storage-fs`** — filesystem storage
- **`@airnauts/airside-extension-slack`** — Slack notification extension
- **`@airnauts/airside-extension-email`** — email notification extension
- **`@airnauts/airside-extension-jira`** — Jira thread-action extension
- **`@airnauts/airside-extension-github`** — GitHub Issues thread-action extension
- **`@airnauts/airside-core`** — shared types and schemas (consumed transitively)

See [docs/architecture.md](https://github.com/Airnauts/airside/blob/main/docs/architecture.md) and the [integration guide](https://github.com/Airnauts/airside/blob/main/docs/integration.md).

## License

MIT © Airnauts
