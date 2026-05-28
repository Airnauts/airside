# M3 — Backend: API core, security & storage

- **Status:** Proposed
- **Date:** 2026-05-28
- **Milestone:** [M3](../../milestones.md#m3--backend-api-core-security--storage--backend--m)
- **Track:** Backend
- **Depends on:** M2a (the frozen `operations` table + zod schemas in `@comments/core`).
- **Source of truth for the contract:** [`docs/architecture.md`](../../architecture.md) §4, §6, §8; ADR-0001, ADR-0003, ADR-0008, ADR-0010, ADR-0012.

## 1. Goal

Ship a **working HTTP API for the entire M2a contract**, persistence-agnostic.
Every endpoint runs end-to-end against an in-memory repository; the
`StorageAdapter` seam has its first two concretes (filesystem + Vercel Blob);
the **shared contract suite** that gates `Repository`/`StorageAdapter`
implementations exists and is green for the in-memory and storage concretes
shipped here. MongoDB and Next.js glue land in **M4** and consume these
interfaces unchanged.

## 2. Scope

### In

- `@comments/server` — a Web-standard `(req: Request) => Promise<Response>`
  core, constructed via `createCommentsServer({ … })`.
- The request pipeline: CORS preflight → security (key + origin) → rate-limit
  → router → zod-validate → use-case → typed JSON / typed-error response.
- All seven data use cases from the M2a operation table:
  `createThread`, `listThreads`, `getThread`, `addComment`,
  `setThreadStatus`, `refreshAnchor`, `uploadAttachment`.
- `Repository` interface + `InMemoryRepository` concrete (exported from
  `@comments/server`).
- `StorageAdapter` interface + two concretes:
  `@comments/storage-fs`, `@comments/storage-vercel-blob`.
- `RateLimiter` interface + `InMemoryRateLimiter` concrete (configurable;
  disable with `rateLimit: false`).
- A new workspace package `@comments/test-support` exporting
  `repositoryContract(name, makeRepo)` and `storageContract(name, makeStorage)`
  — the shared adapter conformance suite that doubles as the TDD spec.
- A tiny dev server (`createDevServer`) using `node:http`, exported via the
  subpath `@comments/server/dev`, for the frontend track to hit before M4.
- A typed cursor codec (`{ updatedAt, id } → opaque base64url`) used by every
  `Repository` implementation.

### Out

- MongoDB persistence (M4).
- Next.js App Router glue / `createNextHandler` (M4).
- Serving `/openapi.json` and the Scalar `/docs` page (M4).
- The Vercel deploy recipe (M4).
- Any frontend code (M5+).

## 3. Decisions taken in this brainstorm

These are the choices made for M3 before writing implementation; recorded here
so M4 doesn't relitigate them.

| # | Decision | Rationale |
|---|---|---|
| 1 | **Single-tenant config, inline** — `createCommentsServer({ secretKey, projectId, env?, allowedOrigins, … })`, no `KeyResolver` seam in v1. | ADR-0008: "one project per mount". A `keyResolver?` can be added additively post-v1 without churning the constructor. |
| 2 | **Cursor codec designed in M3** — opaque base64url of `{ updatedAt, id }`, encoded/decoded in `@comments/server`, consumed identically by the in-memory repo and (in M4) Mongo. | Locks the pagination semantics behind the `Repository` interface so the contract suite is meaningful and Mongo can't drift. |
| 3 | **Real fixed-window in-memory rate limiter, configurable.** | Matches architecture §8 ("basic per-key/IP rate limiting"); a hosted backend can swap in Redis behind the same `RateLimiter` interface. |
| 4 | **Both storage concretes built in M3** (FS + Vercel Blob). Blob tests `it.skipIf(!process.env.BLOB_READ_WRITE_TOKEN)`. | M3 is the milestone that authors the `StorageAdapter` contract suite; building two concretes against it proves the seam end-to-end. |
| 5 | **Tiny built-in dev server** via `node:http`, subpath `@comments/server/dev`. | Unblocks the frontend track per the milestone doc's "frontend can develop against M3's in-memory dev server" promise. Zero new deps. |
| 6 | **`Repository` interface in `@comments/server`; contract suite in a new `@comments/test-support` workspace package.** | Keeps `@comments/core` strictly the wire contract (DOM/Node-free); both Mongo (M4) and the in-memory repo import the same suite without duplicating it. |
| 7 | **Strict `Origin` check on every request including GETs**; `PATCH /threads/:id/anchor` **trusts the client** on `anchorState` / `selectionLost` (validated by zod only). | Architecture §7 calls anchor refresh a self-heal: the client is authoritative on re-match outcome. Strict origin on reads matches the capability-token threat model — a leaked link mustn't read either. |
| 8 | **Router driven by the M2a `operations` table** (Approach A from the brainstorm). One generic dispatcher iterates the table, looks up a per-`operationId` use-case, and auto-validates via the entry's zod schemas. | Honors ADR-0012 ("operation table is the framework-free convention M3 is expected to consume"); makes "every operation has a handler" a one-line test; multipart upload is the one special branch. |

A short follow-up record will be added as **ADR-0013** capturing (a) the
dispatcher-from-operation-table pattern and (b) `@comments/test-support` as the
shared adapter contract gate, so M4 has a stable citation.

## 4. Packages & dependency direction

```
@comments/core               (frozen in M2a, unchanged in M3)
    ▲
    │ imports
    │
@comments/server  ───────►  Repository, StorageAdapter, RateLimiter
    ▲                       Ctx, UseCase, DomainError (interfaces)
    │ imports                cursor codec, InMemoryRepository,
    │                       InMemoryRateLimiter
    │
@comments/storage-fs         ─ implements StorageAdapter
@comments/storage-vercel-blob ─ implements StorageAdapter
@comments/test-support       ─ exports `repositoryContract(makeRepo)`,
                               `storageContract(makeStorage)` (vitest blocks)
```

- `@comments/server` runtime deps: `@comments/core` only. `node:http` lives
  inside the `./dev` subpath export, so production bundlers that import
  `@comments/server` (and not `/dev`) never pull it.
- `@comments/storage-fs` deps: `@comments/server` (interface) + `node:fs/promises`,
  `node:path`. Pure node.
- `@comments/storage-vercel-blob` deps: `@comments/server` (interface) +
  `@vercel/blob`. Test suite skips when `BLOB_READ_WRITE_TOKEN` is unset.
- `@comments/test-support` is `private: true`, dev-dep only; declares `vitest`
  as a peer; depends on `@comments/server` (for interfaces) and `@comments/core`
  (for fixture shapes). M4's `@comments/adapter-mongo` imports it as a
  devDependency to run `repositoryContract('mongo', …)`.
- `@comments/core` gains nothing in M3 — it was frozen in M2a. If a contract
  bug is discovered here, it is fixed in `core` with a new ADR amending M2a,
  not patched server-side.

The current `packages/server/src/next.ts` stub and its barrel export are
**deleted** in M3 (Next.js glue belongs to M4).

## 5. Request pipeline

One entry point: `(req: Request) => Promise<Response>`. Stages, in order:

```
Request ─►
  1. CORS preflight        OPTIONS → 204 + ACAO/ACAH headers, end
  2. security:
        · Origin in allowlist?                  no → 403
        · x-comments-key == secretKey?          no → 401
  3. rate-limit(key, ip, kind)                  over budget → 429
  4. route match                                unknown → 404
  5. parse params / query / body via op schemas zod fail → 400
  6. use-case(input, deps)
  7. serialize success at op.success.status
  ► CORS headers added to every response (incl. 4xx) so the browser
    can read the body.
```

### Ctx injected into every use-case

```ts
type Ctx = {
  projectId: string
  env?: string
  now: () => Date            // injectable for deterministic tests
  ids: {                     // injectable nanoid factories
    thread(): ThreadId
    comment(): CommentId
    author(): AuthorId
    attachment(): AttachmentId
  }
}
```

Use-cases never see the `Request` or any headers — they receive `Ctx` plus
their already-validated `params` / `query` / `body`. This keeps them pure
and headless-testable.

### CORS

- `Access-Control-Allow-Origin: <echoed origin, only if in allowlist>` —
  never `*`, because requests carry a custom header.
- `Access-Control-Allow-Headers: content-type, x-comments-key`.
- `Access-Control-Allow-Methods: GET, POST, PATCH, OPTIONS`.
- `Vary: Origin`.
- Preflights cache for `Access-Control-Max-Age: 600`.

### Security

- The `x-comments-key` header is the bearer capability token; one constant-time
  comparison against `secretKey`. Mismatch / missing → 401 with code
  `AUTH_INVALID_KEY`.
- The `Origin` header is checked against `allowedOrigins` (exact-match list).
  Missing-`Origin` requests (server-to-server) are **rejected** with 403 — this
  is a browser widget. Same code for both: `ORIGIN_NOT_ALLOWED`.
- The two checks run in fixed order (origin before key) so an unauthorized
  origin never gets to probe for a valid key.

### Rate limiter

```ts
interface RateLimiter {
  check(bucket: string):
    Promise<{ ok: true } | { ok: false; retryAfterSec: number }>
}
```

- Bucket key: `${projectId}:${ip}:${kind}` with `kind ∈ {'read','write'}`
  (GET vs everything else).
- Default `InMemoryRateLimiter` uses a fixed window: 60 writes/min,
  600 reads/min per bucket. Configurable via `rateLimit: { writesPerMin,
  readsPerMin }`; `rateLimit: false` disables.
- Client IP is taken from the first hop of `x-forwarded-for` with a
  per-process counter as a fallback. Hosts behind a known proxy can pass
  `extractIp: (req) => string`.
- 429 responses include `Retry-After: <seconds>`.

### Error model

Use-cases throw typed `DomainError` subclasses:

| Error | Status | Code |
|---|---|---|
| `ValidationError` (zod failure or upload type/size) | 400, 413 | `VALIDATION_FAILED`, `UPLOAD_TOO_LARGE` |
| `AuthInvalidKeyError` | 401 | `AUTH_INVALID_KEY` |
| `OriginNotAllowedError` | 403 | `ORIGIN_NOT_ALLOWED` |
| `NotFoundError` | 404 | `NOT_FOUND` |
| `ConflictError` (defined, **not thrown** by any v1 use-case — `setThreadStatus` is idempotent) | 409 | `CONFLICT` |
| `RateLimitedError` | 429 | `RATE_LIMITED` |
| Unknown exception | 500 | `INTERNAL` (no stack leaked) |

A single `toResponse(err)` maps each to the
`{ error: { code, message, details? } }` shape defined in
`@comments/core`'s `contract/errors`.

## 6. Router & dispatcher

At construction time, walk M2a's `operations` array and build a route table:

```ts
type Compiled = {
  op: Operation
  method: 'GET' | 'POST' | 'PATCH'
  regex: RegExp           // compiled from op.path, '/threads/:id' → /^\/threads\/([^/]+)$/
  paramNames: string[]    // ['id']
}
```

Refuse to construct `createCommentsServer` if any `operationId` in the table
has no matching entry in `useCases` — this is the "every operation has a
handler" guarantee, asserted statically at boot.

The dispatcher is one generic function:

```ts
async function dispatch(req: Request, ctx: Ctx): Promise<Response> {
  const route = match(req)                                  // 404 if none
  const { op } = route
  const params  = op.params ? op.params.parse(route.params)             : undefined
  const query   = op.query  ? op.query.parse(searchToObject(req.url))   : undefined
  const body    = op.body === 'multipart'
                    ? await parseMultipart(req)
                  : op.body
                    ? op.body.parse(await req.json())
                    : undefined
  const out = await useCases[op.operationId]({ ctx, params, query, body, deps })
  return json(op.success.status, out)
}
```

zod failures throw `ValidationError({ details: err.format() })` → 400.

### Multipart

`uploadAttachment` is the only `body: 'multipart'` entry. Parsing uses the
Web standard `await req.formData()` (native in Node 22). The dispatcher
expects exactly one `file` field; extra fields are rejected with 400.

## 7. Use cases

One file each, pure async functions of `(input, deps) => output`.

| operationId | shape & key invariants |
|---|---|
| **createThread** | Generates `threadId`, embeds first comment with a fresh `commentId`, sets `anchorState = 'anchored'`, `status = 'open'`, `createdAt = updatedAt = lastActivityAt = ctx.now()`. Persists via `repo.createThread`. Returns the full `Thread`. |
| **listThreads** | Branches on `pageKey`: present → on-page (returns `ThreadListItem[]` with full anchors); absent → panel (across-pages, ordered `updatedAt desc`). Calls `repo.listThreads({ projectId, pageKey?, status?, sort: 'updatedAt', limit, cursor })`. `limit` defaults to 50, capped at 200. |
| **getThread** | `repo.getThread(scope, id)`; `null` → `NotFoundError`. |
| **addComment** | Appends via `repo.addComment(scope, id, { …, createdAt: ctx.now() })`. Bumps thread `updatedAt`. The ADR-0008 "soft cap ~100" is **not enforced in M3** — `addComment`'s M2a contract doesn't list `CONFLICT`, so emitting one would be off-contract. The cap is soft by definition; Mongo (M4) appends freely and the panel paginates. Enforcement is deferred behind a future contract amendment (see §15). |
| **setThreadStatus** | Resolving an already-resolved thread (or reopening an already-open one) is a **no-op** — keeps the client's optimistic UI idempotent. Bumps `updatedAt`. The contract permits `CONFLICT` here, but v1 never emits it; the code stays in the vocabulary for future use. |
| **refreshAnchor** | `repo.updateAnchor(scope, id, patch, now)`. Trusts the client's `anchorState` / `selectionLost` flip (validated only by zod). Bumps `updatedAt`. |
| **uploadAttachment** | Validates content-type (`image/png|jpeg|webp|gif`) and size (default 5 MB, configurable via `uploads: { maxBytes }`); over → `UploadTooLargeError` (413). Calls `storage.put({ data, contentType, name })`; returns the `Attachment` (`{ id, url, name, contentType, size, w?, h? }`). Width/height are intentionally not computed in v1 (no image-decoding dep). |

Both `createThread` and `addComment` write `updatedAt = lastActivityAt =
ctx.now()` so the panel's `(projectId, updatedAt desc)` ordering (M4 index)
works with zero extra logic. `setThreadStatus` and `refreshAnchor` also bump
`updatedAt` — a resolve / re-anchor counts as activity.

## 8. Cursor codec

```ts
// @comments/server/cursor.ts
function encode(c: { updatedAt: Date; id: string }): string  // base64url(JSON({u: ISO, i: id}))
function decode(s: string): { updatedAt: Date; id: string } | undefined
```

`listThreads` translates a decoded cursor into the strict-ordering predicate
`updatedAt < $u OR (updatedAt == $u AND id < $i)` over the sort
`(updatedAt desc, id desc)`. The in-memory repo implements this directly;
M4's Mongo adapter implements it as a compound `$or` query against the
`(projectId, updatedAt desc)` index. A malformed cursor → 400
`VALIDATION_FAILED`.

The cursor is **opaque to the client** — its internal `{ updatedAt, id }`
shape is a server impl detail, intentionally not declared in `@comments/core`.

## 9. Repository & Storage interfaces

### Repository

```ts
type Scope     = { projectId: string; env?: string }
type ListQuery = Scope & {
  pageKey?: string                       // present → on-page; absent → panel
  status?: 'open' | 'resolved'
  sort: 'updatedAt'                      // sole sort in v1
  limit: number                          // 1..200, default 50
  cursor?: string | null
}

interface Repository {
  createThread(input: NewThread): Promise<Thread>
  getThread(scope: Scope, id: ThreadId): Promise<Thread | null>
  listThreads(query: ListQuery): Promise<{
    threads: ThreadListItem[]
    nextCursor: string | null
  }>
  addComment(scope: Scope, threadId: ThreadId, comment: NewComment):
    Promise<Comment>
  setStatus(scope: Scope, threadId: ThreadId,
            status: 'open' | 'resolved', now: Date): Promise<Thread>
  updateAnchor(scope: Scope, threadId: ThreadId,
               patch: AnchorPatch, now: Date): Promise<ThreadListItem>
}
```

- `Scope` is always passed explicitly so a misconfigured adapter can't leak
  another project's data — the repository never reads ambient state.
- `null` from `getThread` means "doesn't exist **or** out of scope". The
  use-case maps both to `NotFoundError` so the boundary doesn't leak the
  difference.

### StorageAdapter

```ts
interface StorageAdapter {
  put(blob: {
    data: Uint8Array | ReadableStream
    contentType: string
    name: string
  }): Promise<{ url: string; key: string; size: number }>
}
```

`delete()` is intentionally **not** in the v1 interface — uploads are
immutable in v1, GC is a post-v1 concern, and the seam is small enough to
add later.

### InMemoryRepository

- Stored as `Map<ThreadId, Thread>` keyed by id, plus a derived index
  `Map<pageKey, Set<ThreadId>>` for on-page lookup.
- Panel queries sort on demand — dev data sizes don't justify a heap.
- Deep-clones threads on read so use-cases can't mutate the store.
- `repository.reset()` clears state (test-only; not part of the `Repository`
  interface).
- Exported from `@comments/server` so integrators can run a zero-dep dev mode.

## 10. The shared contract suite (`@comments/test-support`)

```ts
// @comments/test-support
export function repositoryContract(
  name: string,
  makeRepo: () => Promise<Repository>,
): void                       // builds a `describe(name, () => { … })` block

export function storageContract(
  name: string,
  makeStorage: () => Promise<StorageAdapter>,
): void
```

### Repository contract — what it asserts

- `createThread` → readable by `getThread`, listed by `pageKey`, listed in
  panel.
- Scope isolation: a thread in `(projA, pageX)` is invisible to `(projB, *)`
  and to `(projA, env=prod)` if env differs.
- `addComment` appends, returns the new `Comment`, bumps `updatedAt`.
- `setStatus` round-trips open↔resolved, bumps `updatedAt`; the no-op case
  (already-resolved) returns the thread unchanged in shape.
- `updateAnchor` flips `anchorState`, accepts a new fingerprint, bumps
  `updatedAt`.
- Ordering: panel ordered by `updatedAt desc, id desc` strict tie-break.
- Cursor pagination: walk a 25-item set with `limit: 10`; assert no
  overlap, no gap, `nextCursor === null` on the final page.
- Filter: `?status=open` excludes resolved; `?status=resolved` excludes open.
- `getThread` returns `null` for missing or out-of-scope ids.

### StorageAdapter contract — what it asserts

- `put(image/png, …)` returns a `url` that fetches back the same bytes.
- Two `put`s of the same `name` yield distinct `key`s.
- Size/content-type policing is **not** the adapter's job; tests are upstream
  in the upload use-case.

### Wiring

- `@comments/server`'s own tests instantiate
  `repositoryContract('InMemoryRepository', …)`.
- `@comments/storage-fs` runs `storageContract('fs', …)` against a `tmpdir`.
- `@comments/storage-vercel-blob` runs
  `storageContract('vercel-blob', …)` with `it.skipIf(!process.env.BLOB_READ_WRITE_TOKEN)`.
- M4's `@comments/adapter-mongo` will run
  `repositoryContract('mongo', …)` against `mongodb-memory-server`.

## 11. Dev server

```ts
// @comments/server/dev — subpath export
export function createDevServer(
  server: (req: Request) => Promise<Response>,
  opts?: { port?: number },
): { listen(): Promise<{ port: number }>; close(): Promise<void> }
```

Translates Node's `IncomingMessage` ↔ Web `Request`/`Response` (Node 22
provides both globals). One file, no extra deps. Exposed via
`pnpm --filter @comments/server dev` (default port 4321).

Marked dev-only in the package.json scripts and in a docstring. Production
mounts use M4's Next.js handler.

## 12. File layout (final)

```
packages/server/src/
  index.ts                    # createCommentsServer, public types
  dev.ts                      # createDevServer (subpath: @comments/server/dev)
  ctx.ts                      # Ctx type, id factory
  errors.ts                   # DomainError + toResponse(err)
  cors.ts                     # buildCorsHeaders, isPreflight
  security.ts                 # checkKey, checkOrigin
  rate-limit.ts               # RateLimiter + InMemoryRateLimiter
  router.ts                   # compileRoutes, match, dispatch
  multipart.ts                # parseMultipart
  cursor.ts                   # encode / decode
  repository/
    types.ts                  # Repository, Scope, ListQuery, NewThread, …
    in-memory.ts              # InMemoryRepository
  storage/
    types.ts                  # StorageAdapter
  use-cases/
    create-thread.ts
    list-threads.ts
    get-thread.ts
    add-comment.ts
    set-thread-status.ts
    refresh-anchor.ts
    upload-attachment.ts
  __tests__/                  # pipeline-level integration tests

packages/test-support/
  package.json                # private: true, peer: vitest
  src/
    index.ts                  # re-exports both contract suites
    repository-contract.ts
    storage-contract.ts
    fixtures.ts               # makeThread(), makeComment(), …
```

Existing `packages/server/src/next.ts` (M4) and its barrel entry are deleted
in M3.

## 13. Testing strategy (TDD authoring order — ADR-0010)

Red → green → refactor, fixture/test precedes the unit it covers.

1. **Contract suite** (`@comments/test-support`) — written entirely against
   the interfaces; nothing implements them yet, so `tsc` is happy but
   `vitest` is red.
2. **`InMemoryRepository`** — make `repositoryContract('InMemoryRepository', …)`
   green.
3. **Pipeline tests**, each red first:
   - CORS preflight from allowed origin → 204 + correct ACAO/ACAH headers.
   - Preflight from disallowed origin → 403, no ACAO echoed.
   - Missing `x-comments-key` → 401 `AUTH_INVALID_KEY`.
   - Wrong `x-comments-key` → 401.
   - Valid key, disallowed `Origin` → 403 `ORIGIN_NOT_ALLOWED`.
   - Valid key, missing `Origin` → 403.
   - Over budget → 429 with `Retry-After` header and `RATE_LIMITED` code.
   - Unknown path → 404 (after auth passes).
4. **Use-cases**, one operation at a time. Each starts from a "POST /threads
   returns 201 with the persisted thread" failing test and expands to scope
   isolation, soft-cap, idempotent resolve, multipart upload. The
   "every operation has a handler" test iterates M2a's `operations` array.
5. **Storage concretes** (`storage-fs` then `storage-vercel-blob`), each
   against `storageContract`.

## 14. Exit criteria

- `pnpm --filter @comments/server test` green.
- `repositoryContract('InMemoryRepository', …)` green.
- `storageContract('fs', …)` green; `storageContract('vercel-blob', …)`
  green when `BLOB_READ_WRITE_TOKEN` is set, skipped (not failed) otherwise.
- Every entry in M2a's `operations` table has a registered use-case
  (asserted by an iteration test).
- Security tests pass: 401 (key), 403 (origin, both disallowed and missing),
  204 (preflight), 429 (rate-limited).
- `pnpm --filter @comments/server dev` boots; `curl -H 'x-comments-key: …'
  -H 'Origin: http://localhost:3000' …` round-trips a created thread end-to-end.
- No MongoDB. No Next.js glue. No `/openapi.json` route. (All M4.)

## 15. Out of scope / seams preserved for M4+

- **MongoDB persistence** (`@comments/adapter-mongo`) — implements the
  `Repository` interface against the M3 contract suite.
- **Next.js App Router glue** (`createNextHandler` in `@comments/server/next`).
- **Serving `/openapi.json` + Scalar `/docs`** — generated from the static
  artifact M2a already emits.
- **Vercel deploy recipe** — Vercel + Atlas + Vercel Blob.
- **Multi-tenant `KeyResolver` seam** — additive constructor field;
  preserves the inline-config call site.
- **Redis-backed `RateLimiter` concrete** — slots in behind the existing
  interface.
- **`StorageAdapter.delete()`** + a GC pass — when uploads stop being
  immutable.
- **`uploadAttachment` width/height extraction** — needs an image-decoding
  dep we deliberately skipped in v1.
- **Vercel Blob client-upload tokens** — optimization noted in architecture §6.
- **Comment soft-cap enforcement (~100 per thread, ADR-0008).** Requires
  amending `addComment`'s error set in `@comments/core` to include `CONFLICT`
  (a new ADR amending M2a). Cheap to add once the contract amendment is in.

## 16. Refs

- Architecture §2, §4, §6, §8 — package layout, server pipeline, HTTP
  contract, data model.
- ADR-0001 (library-first, HTTP contract as the boundary).
- ADR-0003 (adapter scope: seams everywhere, minimal concretes).
- ADR-0008 (data model, scope, capability-token + origin allowlist).
- ADR-0010 (backend built test-first).
- ADR-0012 (zod 4 + operation table + zod-openapi 5 as the contract).
- Milestone [M3](../../milestones.md#m3--backend-api-core-security--storage--backend--m).
