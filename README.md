# Comments — Embeddable Commenting Tool

A self-contained, open-source commenting overlay you host yourself. Drop the widget into any web page — Next.js, plain HTML, or anything in between — and reviewers can leave threaded, DOM-anchored comments without touching your page design or sending data to a third-party service.

- **Client-side:** a light-DOM widget with its own bundled React; no iframe, no Shadow DOM.
- **Server-side:** a Web-standard `Request → Response` handler you mount inside your own app.
- **Database:** MongoDB Atlas or PostgreSQL — you choose; the driver only enters builds that import the matching adapter.
- **Storage:** Vercel Blob or local filesystem for image attachments.

---

## Documentation

| Doc | Contents |
|---|---|
| [`docs/architecture.md`](docs/architecture.md) | Integrated v1 system architecture — start here |
| [`docs/prd.md`](docs/prd.md) | Product requirements |
| [`docs/adr.md`](docs/adr.md) | Architecture decision log (ADR-0001…) |
| [`docs/milestones.md`](docs/milestones.md) | Delivery milestones |
| [`docs/integration.md`](docs/integration.md) | Minutes-long integration quickstart |

---

## Packages

This is a pnpm monorepo. All packages under `packages/*` are published to npm under the `@airnauts` scope.

### Core

| Package | Directory | Description |
|---|---|---|
| [`@airnauts/comments-core`](packages/core) | `packages/core` | Isomorphic: Zod schemas, HTTP contract types, `pageKey` normalization, anchor scoring/threshold policy, OpenAPI generator |
| [`@airnauts/comments-client`](packages/client) | `packages/client` | Widget engine (`init()`), light-DOM anchoring runtime, React wrapper (`CommentsLayer`) |
| [`@airnauts/comments-server`](packages/server) | `packages/server` | Web-standard HTTP handler, use cases, CORS/security, adapter interfaces, Next.js glue, dev server |
| [`@airnauts/comments-next`](packages/next) | `packages/next` | One-call Next.js App Router integration (`createCommentsRoute`) |

### Persistence adapters

| Package | Directory | Description |
|---|---|---|
| [`@airnauts/comments-adapter-mongo`](packages/adapter-mongo) | `packages/adapter-mongo` | MongoDB Atlas / self-hosted repository adapter |
| [`@airnauts/comments-adapter-postgres`](packages/adapter-postgres) | `packages/adapter-postgres` | PostgreSQL repository adapter (hybrid columns + `jsonb`; driver-agnostic) |
| [`@airnauts/comments-adapter-memory`](packages/adapter-memory) | `packages/adapter-memory` | In-memory repository for local development and tests |

### Storage adapters

| Package | Directory | Description |
|---|---|---|
| [`@airnauts/comments-storage-vercel-blob`](packages/storage-vercel-blob) | `packages/storage-vercel-blob` | Vercel Blob image-attachment storage |
| [`@airnauts/comments-storage-fs`](packages/storage-fs) | `packages/storage-fs` | Filesystem image-attachment storage |

### Notification extensions

| Package | Directory | Description |
|---|---|---|
| [`@airnauts/comments-notifier-slack`](packages/notifier-slack) | `packages/notifier-slack` | Slack Incoming Webhook notification extension |
| [`@airnauts/comments-notifier-email`](packages/notifier-email) | `packages/notifier-email` | Email notification extension (SMTP via nodemailer or Resend HTTP API) |

### Thread-action extensions

| Package | Directory | Description |
|---|---|---|
| [`@airnauts/comments-integration-jira`](packages/integration-jira) | `packages/integration-jira` | "Create Jira issue" thread-action extension for Jira Cloud |

### Dev-only (not published)

| Package | Directory | Description |
|---|---|---|
| `@airnauts/comments-test-support` | `packages/test-support` | Shared test fixtures and contract suite (private) |

---

## Quick start (Next.js App Router)

### 1. Install

```bash
pnpm add @airnauts/comments-next @airnauts/comments-client \
  @airnauts/comments-adapter-mongo @airnauts/comments-storage-vercel-blob
# React is required in your Next.js app already; no extra peer to install.
```

### 2. Mount the API route

Create `app/api/comments/[...path]/route.ts`:

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

### 3. Mount the widget

In your root layout:

```tsx
'use client'
import { CommentsLayer } from '@airnauts/comments-client/react'

export function CommentsMount() {
  return <CommentsLayer commentsKey={process.env.NEXT_PUBLIC_COMMENTS_KEY!} endpoint="/api/comments" />
}
```

The widget is inert until a page is opened with `?comments-key=<your-secret-key>` in the URL. After that, the key is persisted to `localStorage` so it stays active on subsequent visits.

### Local development (no database)

Swap in the in-memory adapter:

```ts
import { memoryRepository } from '@airnauts/comments-adapter-memory'
import { fileSystemStorage } from '@airnauts/comments-storage-fs'

export const { GET, POST, PATCH, OPTIONS } = createCommentsRoute({
  secretKey: 'dev-key',
  projectId: 'my-app',
  allowedOrigins: ['http://localhost:3000'],
  repository: memoryRepository(),
  storage: fileSystemStorage({ rootDir: './public/uploads', baseUrl: '/uploads' }),
  rateLimit: false,
})
```

See [`docs/integration.md`](docs/integration.md) for the full walkthrough.

---

## Examples

| Example | Description |
|---|---|
| [`examples/nextjs-host`](examples/nextjs-host) | Full Next.js App Router integration — MongoDB, Vercel Blob, Slack notifications, Jira integration, Playwright e2e tests |
| [`examples/playground`](examples/playground) | Minimal Vite + in-memory server sandbox for widget development |

---

## Developing in this monorepo

**Prerequisites:** Node.js ≥ 18, [pnpm](https://pnpm.io/) ≥ 9.

```bash
# Install all dependencies
pnpm install

# Build all packages (required before running examples or tests)
pnpm build

# Run all tests
pnpm test

# Typecheck all packages
pnpm typecheck
```

**Branching:** development happens directly on `main` until the beta release.

**Releases** are managed by [Changesets](https://github.com/changesets/changesets). Publishing is automatic on every push to `main` (after CI passes). See [`RELEASING.md`](RELEASING.md) for the full release procedure.

---

## License

MIT

---

## About

Built and maintained by [Airnauts](https://www.airnauts.com/).
