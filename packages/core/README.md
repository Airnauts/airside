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

# @airnauts/airside-core

Framework-agnostic core for [Airside](https://github.com/Airnauts/airside): Zod schemas, page-key normalization, the anchor scoring/threshold policy, and the HTTP contract types shared by the client and server.

Most consumers get this transitively via `@airnauts/airside-client` or `@airnauts/airside-server`. Install it directly only when you need the shared types in code that sits outside those packages.

## Installation

```bash
pnpm add @airnauts/airside-core
# or
npm install @airnauts/airside-core
```

## Quick start

```ts
import { normalizePageKey, threadLink, DEFAULT_THREAD_PARAM } from '@airnauts/airside-core'

// Canonical page identity key (origin + pathname, trailing slash stripped)
const key = normalizePageKey('https://example.com/page/?q=1')
// → "https://example.com/page"

// Build a deep-link URL that focuses a thread when the page is opened
const url = threadLink('https://example.com/page', 'thread-abc123')
// → "https://example.com/page?airside-thread=thread-abc123"
```

## API reference

### Page key

| Export | Signature / value |
|---|---|
| `normalizePageKey` | `(url: string \| URL) => string` — `origin + pathname`, trailing slash stripped, hash and query excluded |
| `PageKeyFn` | `type PageKeyFn = (url: string) => string` |

### Deep-link

| Export | Signature / value |
|---|---|
| `threadLink` | `(pageUrl: string, threadId: string, param?: string) => string` — appends `?<param>=<id>` to the page URL |
| `DEFAULT_THREAD_PARAM` | `"airside-thread"` |

### Anchor scoring (pure policy)

These are consumed by `@airnauts/airside-client` to implement re-matching. Integrators building custom anchoring can use them directly.

| Export | Description |
|---|---|
| `scoreCandidate(stored, candidate)` | Score a candidate `Signals` object against the stored anchor signals; returns `ScoreResult { total, components, excluded }` |
| `decide(scored, opts?)` | Pick the best match from an array of `{ ref, score }` entries; returns `Decision<T>` — `{ kind: 'anchored', winner, score }` or `{ kind: 'orphaned', reason }` |
| `locateQuote(haystack, ctx)` | Find character offsets for a `QuoteContext` within a text string; returns `QuoteOffsets { start, end }` or `null` |
| `DEFAULT_WEIGHTS` | Default scoring weights (stable attr +0.40, text +0.25, class +0.15, role +0.10, sibling +0.05, ancestor +0.05) |
| `DEFAULT_THRESHOLDS` | `{ accept: 0.60, margin: 0.10 }` |

### HTTP contract

These types describe the wire API served by `@airnauts/airside-server` and consumed by the client. They are defined as Zod schemas and exported both as schemas and as TypeScript types.

**Request bodies / queries:**

| Export | Description |
|---|---|
| `CreateThreadBody` | POST `/threads` body |
| `ListThreadsQuery` | GET `/threads` query params |
| `AddCommentBody` | POST `/threads/:id/comments` body |
| `SetThreadStatusBody` | PATCH `/threads/:id` body |
| `RefreshAnchorBody` | PATCH `/threads/:id/anchor` body |
| `ThreadIdParam` | `:id` path param |
| `ThreadActionParam` | `:id` + `:actionId` path params |

**Responses:**

| Export | Description |
|---|---|
| `ThreadListResponse` | `{ threads: ThreadListItem[]; nextCursor: string \| null }` |

**Domain types:**

`Thread`, `Comment`, `Attachment`, `ThreadListItem`, `Anchor`, `Signals`, `Author`, `CaptureContext`, `Provenance`, `ExternalLink`, `ThreadStatus`, `AnchorState`, `ExtensionSlot`, `ThreadActionDescriptor`

**OpenAPI:**

| Export | Description |
|---|---|
| `buildOpenApiDocument()` | Returns the full OpenAPI 3.1 document object (served by the server at `GET /openapi.json`) |
| `operations` | The frozen route table (`Operation[]`) |
| `Operation` | Route descriptor type |

**Wire constants:**

| Export | Value |
|---|---|
| `KEY_HEADER_NAME` | `"x-airside-key"` |
| `ERROR_CODES` | Tuple of all error code strings |
| `ERROR_STATUS` | `Record<ErrorCode, number>` mapping codes to HTTP status |
| `ErrorCode` | Union of all error code strings |
| `ErrorResponse` | Zod schema for the error wire shape |

### Branded ID types

`ThreadId`, `CommentId`, `AuthorId`, `AttachmentId` — branded Zod string schemas; use these as the type for IDs in custom adapters.

## Requirements

- Node.js ≥ 18 (or any runtime that provides `URL`)
- No DOM or Node-specific APIs — fully isomorphic

## Related packages

This is the shared contract layer for the `@airnauts/airside-*` suite:

- **`@airnauts/airside-client`** — widget engine and React wrapper
- **`@airnauts/airside-server`** — HTTP server, use cases, and adapter interfaces
- **`@airnauts/airside-adapter-mongo`** — MongoDB persistence
- **`@airnauts/airside-adapter-postgres`** — PostgreSQL persistence
- **`@airnauts/airside-storage-vercel-blob`** — Vercel Blob file storage
- **`@airnauts/airside-storage-fs`** — filesystem file storage

See [docs/architecture.md](https://github.com/Airnauts/airside/blob/main/docs/architecture.md) for the full system design.

## License

MIT © Airnauts
