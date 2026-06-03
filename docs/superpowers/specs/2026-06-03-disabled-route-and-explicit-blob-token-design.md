# Design: `disabled` route flag + explicit Vercel Blob token

**Date:** 2026-06-03
**Status:** approved (pending user spec review)

Two small, related changes to the host-facing integration surface, unified by a
single theme — **explicit configuration over ambient/automatic behavior**:

1. `createCommentsRoute` gains a `disabled?: boolean` flag so a host can keep the
   route mounted but fully dormant (every handler 404s, no server built) when its
   backing services aren't configured — without hand-rolling `notFound` handlers.
2. `vercelBlobStorage` requires its `token` explicitly instead of letting
   `@vercel/blob` read `BLOB_READ_WRITE_TOKEN` from `process.env` automatically —
   matching `mongoRepository({ uri })`'s "pass the value to the factory" shape.

Both are **breaking** to the published `0.1.0` packages (`@airnauts/comments-next`,
`@airnauts/comments-storage-vercel-blob`). Pre-1.0, they ship as **minor** bumps
via Changesets, flagged BREAKING in the summary.

---

## Change 1 — `disabled` flag on `createCommentsRoute`

### Motivation

A Next.js host wants the commenting tool live only when *both* its backends are
provisioned (e.g. `MONGODB_URI` **and** `BLOB_READ_WRITE_TOKEN`). When either is
missing — local dev, a preview deploy — the route should stay mounted but answer
`404` to every method, and the widget never mounts. Today hosts express this with
a ternary that hand-builds a `{ GET: notFound, POST: notFound, ... }` object. The
flag moves that boilerplate into the library.

### Design

`disabled` is a **route-level** concern, not a server concern. It lives on
`createCommentsRoute`'s parameter type, *not* on `CreateCommentsServerOptions` —
the server core stays unaware of it.

```ts
// packages/next/src/index.ts
export function createCommentsRoute(
  config: CreateCommentsServerOptions & { disabled?: boolean },
): NextRouteHandlers & { server?: CommentsServer } {
  if (config.disabled) {
    // `NextHandler` is not exported from the server package; an inline async
    // arrow returning a Response structurally satisfies the handler signature,
    // so no type annotation is needed (and `NextHandler` is out of scope here).
    const notFound = async () => new Response('Not Found', { status: 404 })
    return { GET: notFound, POST: notFound, PATCH: notFound, OPTIONS: notFound }
  }
  const server = createCommentsServer(config)
  return { ...createNextHandler(server), server }
}
```

Behavior:

- When `disabled` is truthy: `createCommentsServer` is **never called** — no rate
  limiter is constructed, and the lazy repository/storage are never touched. All
  four handlers (`GET`/`POST`/`PATCH`/`OPTIONS`) return `404 Not Found`.
- When `disabled` is falsy/absent: unchanged — a real `server` is built and
  attached.

### Return-type consequence (breaking)

The `server` field widens from `server: CommentsServer` to
`server?: CommentsServer`. The disabled branch has no server, so it's `undefined`
there; consumers reading `route.server` must now narrow it (`route.server?.…`).
This is the deliberate, accepted trade-off of the "optional flag" approach (vs. a
discriminated-union return type or a 404-stub server). It touches:

- `packages/next/src/index.test.ts:54` — `route.server.handle` → `route.server?.handle`.

### Required config when disabled

`disabled` is an *added* optional flag; the other fields
(`secretKey`/`projectId`/`allowedOrigins`/`repository`/`storage`) stay **required**.
A host that wants the dormant path still constructs the full config object (its
lazy `repository`/`storage` are never invoked). This was chosen over a
discriminated union for minimal type machinery.

---

## Change 2 — explicit `token` for `vercelBlobStorage`

### Motivation

`vercelBlobStorage`'s `token` is currently optional; when omitted, `@vercel/blob`
silently reads `BLOB_READ_WRITE_TOKEN` from `process.env`. That ambient read is the
odd one out among our adapters — `mongoRepository({ uri })` and
`fileSystemStorage({ rootDir, baseUrl })` both take their config explicitly. The
host should pass the env value in, the same way.

### Design

```ts
// packages/storage-vercel-blob/src/index.ts
export type VercelBlobStorageOptions = {
  /** `BLOB_READ_WRITE_TOKEN`, passed explicitly (no ambient `process.env` read). */
  token: string            // was: token?: string
  /** Optional key prefix (e.g. 'staging/'); a trailing `/` is added if missing. */
  prefix?: string
}

export class VercelBlobStorage implements StorageAdapter {
  // ...
  constructor(private readonly opts: VercelBlobStorageOptions) {   // drop `= {}`
    // ...
  }
  // put() already passes `token: this.opts.token` to @vercel/blob — unchanged.
}

export function vercelBlobStorage(opts: VercelBlobStorageOptions): StorageAdapter {  // drop `= {}`
  return new VercelBlobStorage(opts)
}
```

- `token` becomes **required**; `prefix?` stays optional.
- The `= {}` default is dropped from **both** the `VercelBlobStorage` class
  constructor and the `vercelBlobStorage` factory (the class is exported, so
  `new VercelBlobStorage()` users are affected too).
- The token doc comment's "If omitted, `@vercel/blob` reads it from `process.env`"
  sentence is **removed** — it's no longer true.

### Type-level, not runtime (documented choice)

Like `mongoRepository` (which doesn't validate `uri` at construction and connects
lazily), this adds **no runtime guard**. Requiring `token: string` forces
explicitness at the *type* level; a caller who defeats the type (e.g. passes
`undefined as string`) would still hit `@vercel/blob`'s env fallback. That
symmetry with the other adapters is intentional — we surface the requirement in
types and docs, not via a throw.

---

## Combined final state — example route

Both changes land together, against the same call sites. The canonical example
(`examples/nextjs-host/app/api/comments/[...path]/route.ts`) shows them combined.
Note: in the truthy branch, `process.env.BLOB_READ_WRITE_TOKEN` is already narrowed
to `string`, so no `as string` cast is needed.

```ts
export const { GET, POST, PATCH, OPTIONS } = createCommentsRoute({
  // disabled: someCondition,   // ← new flag, when a host wants the dormant path
  secretKey: 'dev-key',
  projectId: 'nextjs-host',
  allowedOrigins: ['http://localhost:3000', 'http://127.0.0.1:3000'],
  repository: process.env.MONGODB_URI
    ? mongoRepository({ uri: process.env.MONGODB_URI })
    : memoryRepository(),
  storage: process.env.BLOB_READ_WRITE_TOKEN
    ? vercelBlobStorage({ token: process.env.BLOB_READ_WRITE_TOKEN })  // explicit; no cast
    : fileSystemStorage({ rootDir: join(process.cwd(), 'public', 'uploads'), baseUrl: '/uploads' }),
  rateLimit: false,
})
```

The pattern the requesting host wants (gate on `MONGODB_URI && BLOB_READ_WRITE_TOKEN`):

```ts
const mongoUri = process.env.MONGODB_URI
const blobToken = process.env.BLOB_READ_WRITE_TOKEN
const enabled = Boolean(mongoUri && blobToken)

export const { GET, POST, PATCH, OPTIONS } = createCommentsRoute({
  disabled: !enabled,
  secretKey: process.env.NEXT_PUBLIC_COMMENTS_KEY ?? 'lear-review',
  projectId: 'lear-frontend',
  allowedOrigins,
  repository: mongoRepository({ uri: mongoUri as string }),     // lazy; untouched when disabled
  storage: vercelBlobStorage({ token: blobToken as string }),   // lazy; untouched when disabled
})
```

(The `as string` casts remain in *this* host because it constructs the config
unconditionally; the example route above avoids them by narrowing inside the
ternary. Both are valid — the host chooses.)

---

## Complete work-list (every site the changes touch)

**Source:**
- `packages/next/src/index.ts` — add `disabled` to param type, widen return to
  `server?`, add the disabled branch.
- `packages/storage-vercel-blob/src/index.ts` — `token` required, drop `= {}`
  (class + factory), fix doc comment.

**Tests (TDD — write/adjust failing tests first):**
- `packages/next/src/index.test.ts` — add a `disabled: true → all handlers 404,
  server undefined` case; update existing `route.server.handle` → `route.server?.handle`.
- `packages/storage-vercel-blob/src/index.test.ts:45` — already passes
  `{ token: 'test-token' }`; verify it still typechecks and consider asserting the
  required-token type contract.

**Examples / docs:**
- `examples/nextjs-host/app/api/comments/[...path]/route.ts:18` — `vercelBlobStorage()`
  → `vercelBlobStorage({ token: process.env.BLOB_READ_WRITE_TOKEN })`.
- `docs/integration.md:82,95,105` — update the storage swap example to pass `token`;
  mention the `disabled` flag where the route is introduced.

**ADRs (`docs/adr.md`, newest-last):**
- ADR-0027 — route-level `disabled` flag on `createCommentsRoute` (context: dormant
  route without hand-rolled handlers; consequence: `server` widens to optional).
- ADR-0028 — explicit `vercelBlobStorage` token (context: ambient `process.env`
  read is inconsistent with other adapters; consequence: breaking, type-level not
  runtime guard).

**Changesets:**
- `@airnauts/comments-next` — minor, BREAKING (`server` now optional; new `disabled`).
- `@airnauts/comments-storage-vercel-blob` — minor, BREAKING (`token` required).

## Testing strategy

Backend packages → TDD. For each source change, the failing test or fixture is
authored first, then red → green → refactor:

- `next`: new test proves disabled handlers 404 and `server` is `undefined`, before
  the branch exists.
- `storage-vercel-blob`: the type-contract expectation (token required) is encoded;
  `@vercel/blob`'s `put` stays mocked as in the existing suite.

Run `pnpm -C packages/next test`, `pnpm -C packages/storage-vercel-blob test`, and
`pnpm lint` (biome ci, the strict gate) before declaring done.
