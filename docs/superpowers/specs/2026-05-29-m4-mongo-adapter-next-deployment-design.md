# M4 — Backend: MongoDB Adapter & Next.js Deployment — Design

- **Status:** Approved (brainstorm complete)
- **Date:** 2026-05-29
- **Milestone:** M4 (Backend · M) in [`docs/milestones.md`](../../milestones.md)
- **Source of truth:** [`docs/architecture.md`](../../architecture.md) §2, §4, §5 · [`docs/adr.md`](../../adr.md) (ADR-0001, ADR-0003, ADR-0007, ADR-0008)
- **Track:** Backend. Depends on: M3. Unblocks: **M9 (integration/E2E)**; gives the frontend track a production-grade backend behind the same HTTP contract.

## 1. Goal & scope

M3 delivered a working HTTP API for the whole contract against an in-memory
repository. M4 puts it on the **v1 target stack**: a real MongoDB `Repository`,
the Next.js App Router mount, and a deployable recipe — without changing the
frozen HTTP contract (M2a) or the server core (M3).

**In scope.**

- **`@comments/adapter-mongo`** — a MongoDB `Repository` that passes the shared
  `repositoryContract` suite (the executable spec) and the §5 indexes.
- **`@comments/server/next`** — App Router glue: `createNextHandler(server)`,
  exported at a new `./next` subpath.
- **Static OpenAPI artifact wiring** — wire the existing `emit:openapi` into the
  build so CI produces `core/dist/openapi.json`.
- **Deploy recipe** — a `docs/` recipe for **Vercel + MongoDB Atlas + Vercel
  Blob**, including the one-line mount and the serverless connection-reuse note.
- **ADR-0014** recording the two architecturally-significant boundary decisions
  (§9).

**Out of scope — descoped this milestone (see §3).** Runtime serving of
`/openapi.json` and the Scalar `/docs` page. v1 ships the **static artifact
only**; live serving + Scalar remain behind the seam ADR-0007 already designed.

**Out of scope — other milestones.** Any frontend (M5–M8). A deployed sample
app or anything under `examples/`, and the Playwright E2E + dogfood deployment
(all **M9**). Other DB / storage / framework adapters (post-v1 seams, ADR-0003).
A live cloud deployment — M4 stops at **deploy-ready** and proves the round-trip
locally on `mongodb-memory-server`; running the live deploy with real credentials
is a follow-up.

## 2. What M3 / M2a already provide (reused, not rebuilt)

| Asset | Where | M4 use |
|---|---|---|
| `buildOpenApiDocument()` + `emit:openapi` script | `@comments/core` | static artifact; M4 only wires it into the build |
| `repositoryContract(name, makeRepo)` | `@comments/test-support` | the Mongo adapter's executable spec |
| `encodeCursor` / `decodeCursor` (`{updatedAt, id}` keyset) | `@comments/server` | reused verbatim so the Mongo cursor format matches in-memory |
| `Repository` interface + `Scope`/`ListQuery`/`NewThread`/… types | `@comments/server` | the contract the Mongo adapter implements |
| `InMemoryRepository` | `@comments/server` | reference semantics + the Next-glue round-trip test |
| `createCommentsServer` + dispatcher + security/CORS/rate-limit | `@comments/server` | mounted unchanged by the Next glue |
| `VercelBlobStorage`, `FsStorage` | storage packages | the deploy recipe wires `VercelBlobStorage` |

The Mongo adapter is a bare placeholder today (`export const packageName`); the
Next glue and the build-artifact wiring are net-new.

## 3. Decisions made (this milestone)

Three forks were resolved during the brainstorm:

| Fork | Decision | Rationale |
|---|---|---|
| Path mapping for the mounted server | **Catch-all reconstruction in the glue** (no `basePath`) | `server.handle` matches bare operation paths (`^/threads$`); mounted at `/api/comments` Next delivers `/api/comments/threads`. The glue rebuilds the operation-relative path from Next's catch-all `params.path`, so the mount is **zero-config and location-agnostic**. A `basePath` server option is a documented future seam (e.g. an Express adapter), not built now (YAGNI). |
| OpenAPI delivery | **Static artifact only** | Nothing in v1 consumes a live endpoint — the in-repo TS client imports `core` types directly (ADR-0007). Runtime `/openapi.json` + Scalar `/docs` stay deferred behind ADR-0007's seam for when the hosted API / non-TS consumers arrive. |
| Mongo derived counts | **Materialize on write** | Storing `commentCount`/`unresolvedCount` keeps the list query a plain indexed `find` + projection (no aggregation) and mirrors `InMemoryRepository` exactly — the contract suite is the spec. |

Descoping the live `/openapi.json` + `/docs` is a deliberate narrowing of the M4
exit criteria in `docs/milestones.md`; updating that line is a deliverable (§10).
It is recorded in **ADR-0014** (§9), not a silent change.

## 4. `@comments/adapter-mongo`

### 4.1 Document model (ADR-0008 / architecture §5)

One `threads` collection. The stored document is the wire `Thread` plus the
server-only scope fields, with two storage conventions:

- **`_id` = the thread's nanoid `id`.** Gives a unique primary key for free and
  makes `getThread` a `findOne({ _id })`. The wire `id` and `_id` are the same
  string; the adapter maps between them at the boundary.
- **`env` normalized to `null`** when absent (stored `env: input.env ?? null`),
  so scope matching is a plain equality (`env: scope.env ?? null`) — semantically
  identical to in-memory's `(t.env ?? undefined) === (scope.env ?? undefined)`.
- **Embedded `comments`** array (soft cap ~100 per §5: **documented, not
  enforced** — parity with in-memory; YAGNI).
- **Materialized `commentCount` / `unresolvedCount`.** `unresolvedCount =
  status === 'open' ? 1 : 0` (mirrors in-memory's `unresolvedCountOf`, which the
  contract asserts: `> 0` while open, `=== 0` once resolved).

### 4.2 Construction & lifecycle

```ts
createMongoRepository({ db }: { db: Db }): Repository   // caller owns the MongoClient
ensureIndexes(db: Db): Promise<void>                    // idempotent createIndexes
```

The repository takes an already-connected driver `Db` so connection lifecycle
(pooling, reuse across serverless invocations) stays the caller's concern — see
the deploy recipe (§7). `ensureIndexes` is separate and idempotent so it can run
once at startup / in a migration step, not per request.

**Indexes (architecture §5):** `(projectId, pageKey)` (on-page load),
`(projectId, updatedAt: -1)` (panel ordering + keyset), `(projectId, status)`.
`_id` is unique by default. `env` leads on `projectId` in every query and is
low-cardinality, so it is filtered post-index in v1 (matches the §5 index list);
adding `env` to the compound keys is a noted later option.

### 4.3 Operation semantics (mirror `InMemoryRepository` exactly)

- **`createThread`** — insert the document with `comments: [firstComment]`,
  `commentCount: 1`, `unresolvedCount: 1` (status `open`). Returns the wire
  `Thread`.
- **`getThread(scope, id)`** — `findOne({ _id: id, projectId, env })`; a scope
  mismatch returns `null`.
- **`listThreads(query)`** — filter `{ projectId, env, pageKey?, status? }`; sort
  `{ updatedAt: -1, _id: -1 }`; keyset via the **server's `decodeCursor`** →
  `$or: [{ updatedAt: { $lt: c.updatedAt } }, { updatedAt: c.updatedAt, _id: { $lt: c.id } }]`;
  `limit = clamp(query.limit, 1, 200)`, fetch `limit + 1` to detect more; project
  away `comments`/`captureContext`/`provenance` to build `ThreadListItem`;
  `nextCursor = encodeCursor({ updatedAt, id })` of the last in-page row when more
  remain, else `null`.
- **`addComment(scope, id, comment)`** — `findOneAndUpdate({ _id, projectId, env })`
  with `$push: { comments }`, `$inc: { commentCount: 1 }`,
  `$set: { updatedAt: comment.createdAt, lastActivityAt: comment.createdAt }`;
  `matchedCount === 0` → **throw** (contract requires scope-mismatch rejection).
  Returns the input comment.
- **`setStatus(scope, id, status, now)`** — `$set: { status, updatedAt: now,
  lastActivityAt: now, unresolvedCount: status === 'open' ? 1 : 0 }`; no match →
  throw. Returns the updated wire `Thread`.
- **`updateAnchor(scope, id, patch, now)`** — `$set` the provided
  `selectors`/`signals` (fall back to existing), `anchorState`, `selectionLost`
  (when provided), and bump `updatedAt`/`lastActivityAt`; no match → throw.
  Returns the updated `ThreadListItem`.

No multi-document transactions are needed (a thread is a single document; every
mutation is atomic at the document level).

### 4.4 Package wiring

`mongodb` becomes a runtime dependency; `mongodb-memory-server` and
`@comments/test-support` are dev dependencies. `package.json` exports, `tsup`
entry, and `tsconfig` references follow the existing package template.

## 5. `@comments/server/next`

New module `packages/server/src/next.ts`, exported at the **`./next`** subpath.

```ts
export function createNextHandler(server: CommentsServer) {
  const handler = async (
    req: Request,
    ctx: { params: Promise<{ path?: string[] }> | { path?: string[] } },
  ) => {
    const { path } = await ctx.params              // Promise on Next 15; await is a no-op on 14
    const url = new URL(req.url)
    const mapped = new URL(`/${(path ?? []).join('/')}${url.search}`, url.origin)
    return server.handle(new Request(mapped, req))  // preserves method/headers/body
  }
  return { GET: handler, POST: handler, PATCH: handler, OPTIONS: handler }
}
```

- The integrator's **entire** mount —
  `app/api/comments/[...path]/route.ts`:
  `export const { GET, POST, PATCH, OPTIONS } = createNextHandler(server)`.
- **No `next` package dependency** — `params` is typed structurally, and the glue
  uses only Web `Request`/`URL`. Awaiting `params` supports Next 15's async params
  while remaining correct on Next 14.
- **`OPTIONS`** is included so CORS preflight reaches `server.handle` (which
  already returns the preflight response).
- `new Request(mapped, req)` copies method/headers/body (multipart uploads pass
  through unchanged).
- `scripts/check-exports.mjs` and the server `tsup` entry list gain `./next`.

The `/dev` server (M5's local backend) stays **root-mounted** (unprefixed paths),
which is unaffected by this glue.

## 6. Static OpenAPI artifact

`emit:openapi` (in `core`) already writes `core/dist/openapi.json` from
`buildOpenApiDocument()`. M4 wires it into the build so CI publishes it
(e.g. `core`'s `build` runs the emit, with `dist/openapi.json` declared as a
turbo output). No runtime route, no Scalar, no `handle()` branch, no server
option. Generation and the smoke test already exist (M2a) and are untouched.

## 7. Deploy recipe (docs only)

A `docs/` recipe (new page, linked from the architecture deployment notes) for
**Vercel + MongoDB Atlas + Vercel Blob**:

- **Env:** `MONGODB_URI` (Atlas), `BLOB_READ_WRITE_TOKEN` (Vercel Blob), the
  capability secret key, and the origin allowlist.
- **Wiring:** a `MongoClient` created **once at module scope** and reused across
  invocations (the serverless connection-reuse pattern), `ensureIndexes(db)` run
  once at startup, then
  `createCommentsServer({ repository: createMongoRepository({ db }), storage: new VercelBlobStorage(), secretKey, projectId, allowedOrigins })`.
- **Mount:** the one-line `createNextHandler` route from §5.

No deployed app and nothing under `examples/` — the full widget host app, the
Playwright E2E, and the dogfood deployment are **M9**. The live deploy is run by
the integrator using this recipe.

## 8. Testing strategy (TDD — ADR-0010)

The Mongo adapter is built **test-first**: wire the contract suite red, then
implement until green.

- **Adapter contract suite.** `repositoryContract('mongo', makeRepo)` in
  `@comments/adapter-mongo`. `makeRepo` boots `mongodb-memory-server` (one server
  per test file), and the factory wrapper gives each test a **fresh collection**
  (the contract suite intentionally registers no `afterEach`, so cleanup lives in
  the wrapper). This is the executable spec and the primary gate.
- **Next-glue unit test.** Build a `CommentsServer` over `InMemoryRepository`,
  wrap it in `createNextHandler`, and simulate Next invoking the handler with
  `{ params: { path: [...] } }` and a `Request` at `/api/comments/...`. Assert a
  create → get round-trip and correct path/verb mapping (including a nested path
  like `threads/:id/comments`).
- **Integration round-trip (the local exit bar).** `createNextHandler` +
  `createMongoRepository` on `mongodb-memory-server`: POST `/threads` then GET
  `/threads/:id` returns the thread. This is the local stand-in for "a sample
  mount … round-trips a thread."
- **Artifact check.** A lightweight assertion (or CI step) that the build
  produces `core/dist/openapi.json`.

## 9. ADR-0014 (added this milestone)

**Title:** M4 deployment glue — Next.js path mapping & v1 OpenAPI delivery.
**Status:** accepted.

1. **Next.js mount maps the path from the catch-all, not a base path.**
   `createNextHandler` reconstructs the operation-relative path from Next's
   `[...path]` segments, so the mount is zero-config and location-agnostic. A
   `basePath` server option is left as a documented seam for non-catch-all /
   other-framework adapters and is **not** built in v1.
2. **v1 ships the static `openapi.json` artifact only.** Runtime `GET
   /openapi.json` and the Scalar `/docs` page (architecture §6, ADR-0007) are
   deferred behind ADR-0007's existing seam — no v1 consumer needs a live
   endpoint. This narrows the M4 exit criteria in `docs/milestones.md`.

The MongoDB document model needs no new ADR — ADR-0008 already decided it.

## 10. Deliverables

- `@comments/adapter-mongo`: `createMongoRepository`, `ensureIndexes`, passing
  `repositoryContract` + the integration round-trip on `mongodb-memory-server`.
- `@comments/server/next`: `createNextHandler`, `./next` export, unit test;
  `scripts/check-exports.mjs` updated.
- Build wiring so CI emits `core/dist/openapi.json`.
- `docs/` deploy recipe (Vercel + Atlas + Blob) + the one-line mount.
- **ADR-0014** appended to `docs/adr.md`.
- `docs/milestones.md` M4 exit criteria updated to reflect the static-only
  OpenAPI decision.

## 11. Exit criteria

- Mongo adapter green on `repositoryContract` **and** the integration round-trip
  (`mongodb-memory-server`).
- One-line Next.js mount works end-to-end (glue unit test + integration test).
- The build produces the static `core/dist/openapi.json`.
- The Vercel + Atlas + Blob deploy recipe is documented and the round-trip is
  proven locally (deploy-ready; the live deploy is a follow-up).
