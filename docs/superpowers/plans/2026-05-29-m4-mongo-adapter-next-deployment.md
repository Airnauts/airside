# M4 — MongoDB Adapter & Next.js Deployment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put the M3 server core on the v1 target stack — a MongoDB `Repository`, a one-line Next.js App Router mount, and a static OpenAPI artifact + deploy recipe — without changing the frozen HTTP contract or the server core.

**Architecture:** `@comments/adapter-mongo` implements the `Repository` interface (from `@comments/server`) against MongoDB, mirroring `InMemoryRepository`'s semantics exactly and gated by the shared `repositoryContract` suite on `mongodb-memory-server`. `@comments/server/next` adds `createNextHandler`, which reconstructs the operation-relative path from Next's `[...path]` catch-all and forwards a Web `Request` to `server.handle` (no `basePath`, no `next` dependency). The existing `emit:openapi` script is wired into the build so CI publishes `core/dist/openapi.json`; runtime serving + Scalar stay deferred (ADR-0014).

**Tech Stack:** TypeScript (ESM), pnpm workspaces + Turborepo, tsup + `tsc --build`, Vitest, Zod 4, MongoDB Node driver v6, `mongodb-memory-server`, Biome.

**Spec:** [`docs/superpowers/specs/2026-05-29-m4-mongo-adapter-next-deployment-design.md`](../specs/2026-05-29-m4-mongo-adapter-next-deployment-design.md)

---

## File structure

**`@comments/adapter-mongo`** (today: a placeholder `index.ts` + `index.test.ts`):
- Create `packages/adapter-mongo/src/repository.ts` — `createMongoRepository({ db })`; the `Repository` implementation + the stored-document mapping. One responsibility: MongoDB persistence.
- Create `packages/adapter-mongo/src/indexes.ts` — `ensureIndexes(db)`; the three §5 indexes. Separated so it runs once at startup, not per request.
- Rewrite `packages/adapter-mongo/src/index.ts` — re-export the two above; drop the `packageName` placeholder.
- Create `packages/adapter-mongo/src/repository.test.ts` — `mongodb-memory-server` harness + `repositoryContract` + the index assertion.
- Create `packages/adapter-mongo/src/integration.test.ts` — `createNextHandler` + Mongo round-trip (Task 3).
- Delete `packages/adapter-mongo/src/index.test.ts` — the M1 `packageName` smoke test.
- Modify `packages/adapter-mongo/package.json` — add `mongodb` (dep), `mongodb-memory-server` + `@comments/test-support` (devDeps).

**`@comments/server`**:
- Create `packages/server/src/next.ts` — `createNextHandler`.
- Create `packages/server/src/next.test.ts` — glue unit test.
- Modify `packages/server/package.json` — add the `./next` export.
- Modify `packages/server/tsup.config.ts` — add the `next` entry.

**Repo-level**:
- Modify `scripts/check-exports.mjs` — change the adapter-mongo symbol; add `@comments/server/next`.
- Modify `packages/core/package.json` — wire `emit:openapi` into `build`.
- Create `docs/deploy-vercel-atlas-blob.md` — the deploy recipe.
- Modify `docs/adr.md` — append ADR-0014.
- Modify `docs/milestones.md` — narrow the M4 exit criteria (static-only OpenAPI).

---

## Task 1: `@comments/adapter-mongo` — MongoDB `Repository`

**Files:**
- Modify: `packages/adapter-mongo/package.json`
- Create: `packages/adapter-mongo/src/repository.ts`
- Create: `packages/adapter-mongo/src/indexes.ts`
- Modify: `packages/adapter-mongo/src/index.ts`
- Create: `packages/adapter-mongo/src/repository.test.ts`
- Delete: `packages/adapter-mongo/src/index.test.ts`
- Modify: `scripts/check-exports.mjs:18` (the `@comments/adapter-mongo` entry)

- [ ] **Step 1: Add dependencies and install**

Edit `packages/adapter-mongo/package.json` to add the `dependencies`/`devDependencies` shown (keep the rest of the file as-is):

```json
{
  "name": "@comments/adapter-mongo",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "files": ["dist"],
  "scripts": {
    "build": "tsup && tsc --build",
    "typecheck": "tsc --build",
    "test": "vitest run"
  },
  "dependencies": {
    "@comments/core": "workspace:*",
    "@comments/server": "workspace:*",
    "mongodb": "^6.12.0"
  },
  "devDependencies": {
    "@comments/test-support": "workspace:*",
    "mongodb-memory-server": "^10.1.2"
  }
}
```

Then, from the repo root:

```bash
pnpm install
```

- [ ] **Step 2: Build the workspace so cross-package imports resolve**

Vitest resolves `@comments/server`, `@comments/core`, and `@comments/test-support` through their `exports` maps (i.e. `dist/`), so they must be built before the adapter's tests can import them.

Run: `pnpm build`
Expected: turbo builds all packages green (adapter-mongo still builds as the old placeholder).

- [ ] **Step 3: Write the failing contract test + harness**

Delete the placeholder smoke test:

```bash
rm packages/adapter-mongo/src/index.test.ts
```

Create `packages/adapter-mongo/src/repository.test.ts`:

```ts
import { repositoryContract } from '@comments/test-support'
import { type Db, MongoClient } from 'mongodb'
import { MongoMemoryServer } from 'mongodb-memory-server'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { createMongoRepository, ensureIndexes } from './index'

let mongod: MongoMemoryServer
let client: MongoClient
let db: Db

beforeAll(async () => {
  mongod = await MongoMemoryServer.create()
  client = new MongoClient(mongod.getUri())
  await client.connect()
  db = client.db('comments_test')
  await ensureIndexes(db)
}, 60_000)

afterAll(async () => {
  await client?.close()
  await mongod?.stop()
})

// The contract suite calls makeRepo in beforeEach and registers no afterEach,
// so isolation lives here: clear the shared collection before each test.
repositoryContract('mongo', async () => {
  await db.collection('threads').deleteMany({})
  return createMongoRepository({ db })
})

it('ensureIndexes creates the three scoped indexes', async () => {
  const names = (await db.collection('threads').indexes()).map((i) => i.name)
  expect(names).toEqual(
    expect.arrayContaining(['projectId_pageKey', 'projectId_updatedAt', 'projectId_status']),
  )
})
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `pnpm --filter @comments/adapter-mongo exec vitest run src/repository.test.ts`
Expected: FAIL — `'./index'` has no exported member `createMongoRepository` (and `ensureIndexes`).

- [ ] **Step 5: Implement `ensureIndexes`**

Create `packages/adapter-mongo/src/indexes.ts`:

```ts
import type { Db } from 'mongodb'

/**
 * Create the scoped indexes from architecture §5. Idempotent: MongoDB's
 * createIndexes is a no-op when an identical index already exists, so this is
 * safe to run on every startup.
 */
export async function ensureIndexes(db: Db): Promise<void> {
  await db.collection('threads').createIndexes([
    { key: { projectId: 1, pageKey: 1 }, name: 'projectId_pageKey' },
    { key: { projectId: 1, updatedAt: -1 }, name: 'projectId_updatedAt' },
    { key: { projectId: 1, status: 1 }, name: 'projectId_status' },
  ])
}
```

- [ ] **Step 6: Implement the repository**

Create `packages/adapter-mongo/src/repository.ts`:

```ts
import type { Comment, Thread, ThreadId, ThreadListItem, ThreadStatus } from '@comments/core'
import {
  type AnchorPatch,
  decodeCursor,
  encodeCursor,
  type ListQuery,
  type ListResult,
  type NewComment,
  type NewThread,
  type Repository,
  type Scope,
} from '@comments/server'
import type { Db, Filter, UpdateFilter } from 'mongodb'

const COLLECTION = 'threads'

/** Stored shape: the wire Thread (minus its `id`) keyed by `_id`, plus server-only scope. */
type StoredThread = Omit<Thread, 'id'> & {
  _id: string
  projectId: string
  env: string | null
}

function scopeFilter(scope: Scope): { projectId: string; env: string | null } {
  return { projectId: scope.projectId, env: scope.env ?? null }
}

function unresolvedCountOf(status: ThreadStatus): number {
  return status === 'open' ? 1 : 0
}

function toThread(doc: StoredThread): Thread {
  const { _id, projectId: _p, env: _e, ...rest } = doc
  return { id: _id as ThreadId, ...rest }
}

function toListItem(doc: StoredThread): ThreadListItem {
  // Strip server-only scope + thread-only payload (also absent under the list projection).
  const {
    _id,
    projectId: _p,
    env: _e,
    comments: _c,
    captureContext: _cc,
    provenance: _pr,
    ...rest
  } = doc
  return { id: _id as ThreadId, ...rest }
}

export function createMongoRepository({ db }: { db: Db }): Repository {
  const col = db.collection<StoredThread>(COLLECTION)

  return {
    async createThread(input: NewThread): Promise<Thread> {
      const doc: StoredThread = {
        _id: input.id,
        projectId: input.projectId,
        env: input.env ?? null,
        scope: input.scope,
        pageKey: input.pageKey,
        pageUrl: input.pageUrl,
        ...(input.pageTitle !== undefined ? { pageTitle: input.pageTitle } : {}),
        anchor: input.anchor,
        status: input.status,
        anchorState: input.anchorState,
        ...(input.selectionLost !== undefined ? { selectionLost: input.selectionLost } : {}),
        commentCount: 1,
        unresolvedCount: unresolvedCountOf(input.status),
        createdBy: input.createdBy,
        createdAt: input.createdAt,
        updatedAt: input.updatedAt,
        lastActivityAt: input.lastActivityAt,
        schemaVersion: input.schemaVersion,
        comments: [input.firstComment],
        captureContext: input.captureContext,
        ...(input.provenance !== undefined ? { provenance: input.provenance } : {}),
      }
      await col.insertOne(doc)
      return toThread(doc)
    },

    async getThread(scope: Scope, id: ThreadId): Promise<Thread | null> {
      const doc = await col.findOne({ _id: id, ...scopeFilter(scope) })
      return doc ? toThread(doc) : null
    },

    async listThreads(query: ListQuery): Promise<ListResult> {
      const limit = Math.max(1, Math.min(query.limit, 200))
      const filter: Record<string, unknown> = scopeFilter(query)
      if (query.pageKey !== undefined) filter.pageKey = query.pageKey
      if (query.status !== undefined) filter.status = query.status
      const cursor = query.cursor ? decodeCursor(query.cursor) : undefined
      if (cursor) {
        filter.$or = [
          { updatedAt: { $lt: cursor.updatedAt } },
          { updatedAt: cursor.updatedAt, _id: { $lt: cursor.id } },
        ]
      }
      const docs = await col
        .find(filter as Filter<StoredThread>, {
          projection: { comments: 0, captureContext: 0, provenance: 0 },
        })
        .sort({ updatedAt: -1, _id: -1 })
        .limit(limit + 1)
        .toArray()
      const more = docs.length > limit
      const page = more ? docs.slice(0, limit) : docs
      const last = page[page.length - 1]
      const nextCursor =
        more && last ? encodeCursor({ updatedAt: last.updatedAt, id: last._id }) : null
      return { threads: page.map((d) => toListItem(d as StoredThread)), nextCursor }
    },

    async addComment(scope: Scope, threadId: ThreadId, comment: NewComment): Promise<Comment> {
      const res = await col.updateOne(
        { _id: threadId, ...scopeFilter(scope) },
        {
          $push: { comments: comment },
          $inc: { commentCount: 1 },
          $set: { updatedAt: comment.createdAt, lastActivityAt: comment.createdAt },
        },
      )
      if (res.matchedCount === 0) throw new Error('thread not found')
      return comment
    },

    async setStatus(
      scope: Scope,
      threadId: ThreadId,
      status: ThreadStatus,
      now: string,
    ): Promise<Thread> {
      const doc = await col.findOneAndUpdate(
        { _id: threadId, ...scopeFilter(scope) },
        {
          $set: {
            status,
            updatedAt: now,
            lastActivityAt: now,
            unresolvedCount: unresolvedCountOf(status),
          },
        },
        { returnDocument: 'after' },
      )
      if (!doc) throw new Error('thread not found')
      return toThread(doc)
    },

    async updateAnchor(
      scope: Scope,
      threadId: ThreadId,
      patch: AnchorPatch,
      now: string,
    ): Promise<ThreadListItem> {
      const set: Record<string, unknown> = {
        anchorState: patch.anchorState,
        updatedAt: now,
        lastActivityAt: now,
      }
      if (patch.selectors !== undefined) set['anchor.selectors'] = patch.selectors
      if (patch.signals !== undefined) set['anchor.signals'] = patch.signals
      if (patch.selectionLost !== undefined) set.selectionLost = patch.selectionLost
      const doc = await col.findOneAndUpdate(
        { _id: threadId, ...scopeFilter(scope) },
        { $set: set } as UpdateFilter<StoredThread>,
        { returnDocument: 'after' },
      )
      if (!doc) throw new Error('thread not found')
      return toListItem(doc)
    },
  }
}
```

Notes for the implementer:
- MongoDB driver **v6**: `findOneAndUpdate` returns the document directly (or `null`), not a `{ value }` wrapper. `returnDocument: 'after'` gives the post-update doc.
- `_id` is the thread's nanoid `id` — sorting/keyset by `_id` is sorting by `id`, which is what the contract's `(updatedAt desc, id desc)` tiebreak and cursor expect.
- `env` is stored as `null` when absent and matched with `{ env: scope.env ?? null }`; MongoDB treats `{ env: null }` as matching both stored `null` and missing, identical to in-memory's `(t.env ?? undefined) === (scope.env ?? undefined)`.
- Throwing a plain `Error` on scope mismatch mirrors `InMemoryRepository`; the contract only asserts `.rejects.toThrow()`.

- [ ] **Step 7: Rewrite the package entry point**

Replace the entire contents of `packages/adapter-mongo/src/index.ts`:

```ts
export { ensureIndexes } from './indexes'
export { createMongoRepository } from './repository'
```

- [ ] **Step 8: Run the test to verify it passes**

Run: `pnpm --filter @comments/adapter-mongo exec vitest run src/repository.test.ts`
Expected: PASS — all `Repository contract — mongo` cases green, plus the index assertion. (First run downloads a `mongod` binary; allow time.)

- [ ] **Step 9: Typecheck (vitest does NOT typecheck — esbuild strips types)**

The per-test runner does not type-check, so run the project's type gate explicitly to catch driver-typing issues (e.g. `Filter`/`UpdateFilter` assignability) now rather than in Task 7.

Run: `pnpm --filter @comments/adapter-mongo typecheck`
Expected: `tsc --build` exits 0, no errors.

- [ ] **Step 10: Update the export-resolution check**

In `scripts/check-exports.mjs`, change the adapter-mongo entry from the placeholder symbol to a real one:

```js
  ['@comments/adapter-mongo', 'createMongoRepository'],
```

Then:

```bash
pnpm --filter @comments/adapter-mongo build
pnpm check:exports
```

Expected: `✓ @comments/adapter-mongo -> createMongoRepository` among the resolved entries.

- [ ] **Step 11: Commit**

```bash
git add packages/adapter-mongo scripts/check-exports.mjs pnpm-lock.yaml
git commit -m "M4: @comments/adapter-mongo — MongoDB Repository green against repositoryContract"
```

---

## Task 2: `@comments/server/next` glue

**Files:**
- Create: `packages/server/src/next.ts`
- Create: `packages/server/src/next.test.ts`
- Modify: `packages/server/package.json` (exports)
- Modify: `packages/server/tsup.config.ts` (entry)
- Modify: `scripts/check-exports.mjs` (add entry)

- [ ] **Step 1: Write the failing glue test**

Create `packages/server/src/next.test.ts`:

```ts
import { KEY_HEADER_NAME } from '@comments/core'
import { makeCreateThreadBody } from '@comments/test-support'
import { describe, expect, it } from 'vitest'
import { createNextHandler } from './next'
import { InMemoryRepository } from './repository/in-memory'
import { createCommentsServer } from './server'
import type { StorageAdapter } from './storage/types'

const stubStorage: StorageAdapter = {
  async put() {
    return { url: 'https://blob.test/x', key: 'x', size: 0 }
  },
}

function build() {
  const server = createCommentsServer({
    secretKey: 'sk_test',
    projectId: 'proj_x',
    allowedOrigins: ['https://app.example.com'],
    repository: new InMemoryRepository(),
    storage: stubStorage,
    rateLimit: { writesPerMin: 1000, readsPerMin: 1000 },
  })
  return createNextHandler(server)
}

const headers = {
  origin: 'https://app.example.com',
  [KEY_HEADER_NAME]: 'sk_test',
  'content-type': 'application/json',
}

describe('createNextHandler', () => {
  it('maps the catch-all path and round-trips create → get', async () => {
    const { GET, POST } = build()

    const created = await POST(
      new Request('https://host/api/comments/threads', {
        method: 'POST',
        headers,
        body: JSON.stringify(makeCreateThreadBody()),
      }),
      { params: Promise.resolve({ path: ['threads'] }) },
    )
    expect(created.status).toBe(201)
    const { id } = await created.json()
    expect(typeof id).toBe('string')

    const got = await GET(
      new Request(`https://host/api/comments/threads/${id}`, { headers }),
      { params: Promise.resolve({ path: ['threads', id] }) },
    )
    expect(got.status).toBe(200)
    expect((await got.json()).id).toBe(id)
  })

  it('preserves the query string when mapping nested paths', async () => {
    const { GET } = build()
    const res = await GET(
      new Request('https://host/api/comments/threads?status=open&pageKey=example.com/about', {
        headers,
      }),
      { params: Promise.resolve({ path: ['threads'] }) },
    )
    expect(res.status).toBe(200)
    expect((await res.json()).threads).toEqual([])
  })

  it('accepts a synchronous params object (Next 14)', async () => {
    const { GET } = build()
    const res = await GET(new Request('https://host/api/comments/threads', { headers }), {
      params: { path: ['threads'] },
    })
    expect(res.status).toBe(200)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @comments/server exec vitest run src/next.test.ts`
Expected: FAIL — cannot find module `./next` / `createNextHandler` is not defined.

- [ ] **Step 3: Implement the glue**

Create `packages/server/src/next.ts`:

```ts
import type { CommentsServer } from './server'

/** Next App Router catch-all context. `params` is a Promise on Next 15 and a plain object on Next 14. */
type NextRouteContext = { params: Promise<{ path?: string[] }> | { path?: string[] } }
type NextHandler = (req: Request, ctx: NextRouteContext) => Promise<Response>

/**
 * App Router glue for `app/api/comments/[...path]/route.ts`:
 *   export const { GET, POST, PATCH, OPTIONS } = createNextHandler(server)
 *
 * Next strips the mount prefix and hands us the remaining segments in
 * `params.path`; we rebuild the operation-relative URL the dispatcher expects,
 * so the server core stays unaware of where it is mounted (no basePath).
 */
export function createNextHandler(server: CommentsServer): {
  GET: NextHandler
  POST: NextHandler
  PATCH: NextHandler
  OPTIONS: NextHandler
} {
  const handler: NextHandler = async (req, ctx) => {
    const { path } = await ctx.params // awaiting a non-Promise is a no-op (Next 14 safe)
    const url = new URL(req.url)
    const mapped = new URL(`/${(path ?? []).join('/')}${url.search}`, url.origin)
    return server.handle(new Request(mapped, req)) // copies method/headers/body
  }
  return { GET: handler, POST: handler, PATCH: handler, OPTIONS: handler }
}
```

- [ ] **Step 4: Wire the `./next` subpath export**

In `packages/server/package.json`, add the `./next` key to `exports` (keep `.` and `./dev`):

```json
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    },
    "./dev": {
      "types": "./dist/dev.d.ts",
      "import": "./dist/dev.js"
    },
    "./next": {
      "types": "./dist/next.d.ts",
      "import": "./dist/next.js"
    }
  },
```

In `packages/server/tsup.config.ts`, add `next` to the entry map:

```ts
import { defineConfig } from 'tsup'

export default defineConfig({
  entry: { index: 'src/index.ts', dev: 'src/dev.ts', next: 'src/next.ts' },
  format: ['esm'],
  dts: false,
  sourcemap: true,
  outDir: 'dist',
  clean: ['dist/**/*.js', 'dist/**/*.js.map'],
})
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm --filter @comments/server exec vitest run src/next.test.ts`
Expected: PASS — all three `createNextHandler` cases green.

- [ ] **Step 5b: Typecheck (vitest does NOT typecheck)**

Run: `pnpm --filter @comments/server typecheck`
Expected: `tsc --build` exits 0, no errors.

- [ ] **Step 6: Add the export-resolution check**

In `scripts/check-exports.mjs`, add an entry directly after the `@comments/server/dev` line:

```js
  ['@comments/server/next', 'createNextHandler'],
```

Then:

```bash
pnpm --filter @comments/server build
pnpm check:exports
```

Expected: `✓ @comments/server/next -> createNextHandler` among the resolved entries.

- [ ] **Step 7: Commit**

```bash
git add packages/server scripts/check-exports.mjs
git commit -m "M4: @comments/server/next — createNextHandler via catch-all path reconstruction"
```

---

## Task 3: Integration round-trip (Next glue + Mongo)

This is the local stand-in for the milestone's "a sample mount … round-trips a thread" exit criterion: drive `createNextHandler` over the real `MongoRepository` on `mongodb-memory-server`.

**Files:**
- Create: `packages/adapter-mongo/src/integration.test.ts`

- [ ] **Step 1: Write the integration test**

Create `packages/adapter-mongo/src/integration.test.ts`:

```ts
import { KEY_HEADER_NAME } from '@comments/core'
import { createCommentsServer } from '@comments/server'
import { createNextHandler } from '@comments/server/next'
import type { StorageAdapter } from '@comments/server'
import { makeCreateThreadBody } from '@comments/test-support'
import { type Db, MongoClient } from 'mongodb'
import { MongoMemoryServer } from 'mongodb-memory-server'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { createMongoRepository, ensureIndexes } from './index'

const stubStorage: StorageAdapter = {
  async put() {
    return { url: 'https://blob.test/x', key: 'x', size: 0 }
  },
}

let mongod: MongoMemoryServer
let client: MongoClient
let db: Db

beforeAll(async () => {
  mongod = await MongoMemoryServer.create()
  client = new MongoClient(mongod.getUri())
  await client.connect()
  db = client.db('comments_integration')
  await ensureIndexes(db)
}, 60_000)

afterAll(async () => {
  await client?.close()
  await mongod?.stop()
})

const headers = {
  origin: 'https://app.example.com',
  [KEY_HEADER_NAME]: 'sk_test',
  'content-type': 'application/json',
}

it('round-trips a thread through the Next handler against MongoDB', async () => {
  const server = createCommentsServer({
    secretKey: 'sk_test',
    projectId: 'proj_x',
    allowedOrigins: ['https://app.example.com'],
    repository: createMongoRepository({ db }),
    storage: stubStorage,
    rateLimit: { writesPerMin: 1000, readsPerMin: 1000 },
  })
  const { GET, POST } = createNextHandler(server)

  const created = await POST(
    new Request('https://host/api/comments/threads', {
      method: 'POST',
      headers,
      body: JSON.stringify(makeCreateThreadBody()),
    }),
    { params: Promise.resolve({ path: ['threads'] }) },
  )
  expect(created.status).toBe(201)
  const { id } = await created.json()

  const got = await GET(new Request(`https://host/api/comments/threads/${id}`, { headers }), {
    params: Promise.resolve({ path: ['threads', id] }),
  })
  expect(got.status).toBe(200)
  const body = await got.json()
  expect(body.id).toBe(id)
  expect(body.comments).toHaveLength(1)
})
```

- [ ] **Step 2: Run the test to verify it passes**

(`createMongoRepository`, `ensureIndexes`, and `createNextHandler` all exist from Tasks 1–2, so this passes on first run. Build first so the `@comments/server` and `@comments/server/next` dist are present.)

Run:
```bash
pnpm build
pnpm --filter @comments/adapter-mongo exec vitest run src/integration.test.ts
```
Expected: PASS — `round-trips a thread through the Next handler against MongoDB`.

- [ ] **Step 3: Commit**

```bash
git add packages/adapter-mongo/src/integration.test.ts
git commit -m "M4: integration test — Next handler + MongoDB round-trip on mongodb-memory-server"
```

---

## Task 4: Static OpenAPI artifact build wiring

`emit:openapi` already writes `core/dist/openapi.json` from `buildOpenApiDocument()`. Wire it into `core`'s build so CI produces it. `tsup`'s `clean` only removes `*.js`/`*.js.map`, and the emit runs last, so the JSON survives.

**Files:**
- Modify: `packages/core/package.json` (the `build` script)

- [ ] **Step 1: Append the emit to the build script**

In `packages/core/package.json`, change the `build` script (leave `emit:openapi` as-is):

```json
    "build": "tsup && tsc --build && tsx scripts/emit-openapi.ts",
```

- [ ] **Step 2: Verify the artifact is produced**

Run:
```bash
rm -f packages/core/dist/openapi.json
pnpm --filter @comments/core build
test -f packages/core/dist/openapi.json && echo "ARTIFACT OK"
```
Expected: build logs `wrote …/core/dist/openapi.json` and the command prints `ARTIFACT OK`.

- [ ] **Step 3: Sanity-check the artifact is valid OpenAPI 3.1**

Run:
```bash
node -e "const d=require('./packages/core/dist/openapi.json'); if(d.openapi!=='3.1.0'||!d.paths['/threads']) throw new Error('bad openapi'); console.log('OPENAPI OK', d.openapi)"
```
Expected: `OPENAPI OK 3.1.0`.

- [ ] **Step 4: Commit**

```bash
git add packages/core/package.json
git commit -m "M4: wire emit:openapi into core build so CI publishes the static artifact"
```

---

## Task 5: Deploy recipe (Vercel + Atlas + Blob)

**Files:**
- Create: `docs/deploy-vercel-atlas-blob.md`

- [ ] **Step 1: Write the recipe**

Create `docs/deploy-vercel-atlas-blob.md`:

````markdown
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
````

- [ ] **Step 2: Commit**

```bash
git add docs/deploy-vercel-atlas-blob.md
git commit -m "M4: deploy recipe — Vercel + MongoDB Atlas + Vercel Blob"
```

---

## Task 6: ADR-0014 + milestone exit-criteria update

**Files:**
- Modify: `docs/adr.md` (append, newest-last)
- Modify: `docs/milestones.md` (M4 exit criteria)

- [ ] **Step 1: Append ADR-0014**

Add to the end of `docs/adr.md`:

```markdown

---

## ADR-0014 — M4 deployment glue: Next.js path mapping & v1 OpenAPI delivery

- **Date:** 2026-05-29
- **Status:** accepted

**Context.** M4 mounts the M3 server core on the v1 target stack. Two boundary
choices are architecturally significant because integrators and future adapters
build on them: (1) how a request under a mount prefix (`/api/comments/…`) reaches
the dispatcher, which matches **bare** operation paths (`^/threads$`, no prefix
stripping); and (2) how the OpenAPI contract (ADR-0007) is delivered in v1.
Architecture §6 and ADR-0007 anticipated serving `GET /openapi.json` + a Scalar
`/docs` page; M4 decides whether to build that now.

**Decision.**

1. **The Next.js mount maps the path from the catch-all, not a configured base
   path.** `createNextHandler(server)` (in `@comments/server/next`) reconstructs
   the operation-relative path from Next's `[...path]` segments, rebuilds the Web
   `Request`, and calls `server.handle`. The mount is zero-config and
   location-agnostic — the integrator's whole glue is
   `export const { GET, POST, PATCH, OPTIONS } = createNextHandler(server)`. A
   `basePath` option on `createCommentsServer` is left as a documented seam for
   non-catch-all / other-framework adapters (e.g. Express) and is **not** built in
   v1 (YAGNI).
2. **v1 ships the static `openapi.json` artifact only.** `core`'s existing
   `emit:openapi` is wired into the build so CI publishes `core/dist/openapi.json`.
   Runtime `GET /openapi.json` and the Scalar `/docs` page are **deferred** behind
   ADR-0007's seam: no v1 consumer needs a live endpoint (the in-repo TS client
   imports `core` types directly), and a browser hitting `/docs` sends no
   capability key, so gating it is self-defeating while serving it publicly adds
   surface for no v1 benefit. This narrows the M4 exit criteria in
   `docs/milestones.md`.

**Consequences.**
- Integrators mount with one line and never configure a base path; the core stays
  unaware of its mount location.
- The glue couples to Next's catch-all convention and the Web `Request` contract;
  it `await`s `params` so it is correct on both Next 14 (sync) and Next 15 (async
  params). No `next` package dependency is added.
- The OpenAPI contract ships as a build artifact for CI/publishing and future
  non-TS consumers; enabling live serving + Scalar later is additive and touches
  only `@comments/server` (the seam is unchanged).
- The MongoDB document model needs no new record — ADR-0008 already decided it; M4
  implements it behind the `Repository` interface.
```

- [ ] **Step 2: Narrow the M4 exit criteria in the roadmap**

In `docs/milestones.md`, in the **M4** section, update the OpenAPI items to reflect static-only delivery.

Change the **In scope** clause `**OpenAPI generation + Scalar docs** + static artifact` to:

```
**static OpenAPI artifact** (runtime `/openapi.json` + Scalar `/docs` deferred — ADR-0014)
```

Change the **Exit criteria** clause `` `/openapi.json` + `/docs` serve; `` to:

```
the build emits the static `core/dist/openapi.json`;
```

- [ ] **Step 3: Commit**

```bash
git add docs/adr.md docs/milestones.md
git commit -m "M4: ADR-0014 (Next path mapping + static-only OpenAPI); narrow M4 exit criteria"
```

---

## Task 7: Full repo green gate

**Files:** none (verification only).

- [ ] **Step 1: Build, typecheck, test, lint, and check exports across the workspace**

Run:
```bash
pnpm build && pnpm typecheck && pnpm test && pnpm lint && pnpm check:exports
```
Expected: all green — including `Repository contract — mongo`, `createNextHandler`, the Mongo+Next integration test, and `✓ @comments/adapter-mongo -> createMongoRepository` / `✓ @comments/server/next -> createNextHandler`.

- [ ] **Step 2: If `pnpm lint` reports formatting issues, fix and re-run**

Run: `pnpm format` then re-run `pnpm lint`.
Expected: `biome ci` clean.

- [ ] **Step 3: Commit any lint/format fixes (if Step 2 changed files)**

```bash
git add -A
git commit -m "M4: lint/format pass"
```

---

## Self-review (completed)

- **Spec coverage:** §4 adapter-mongo → Task 1; §5 Next glue → Task 2; §6 static artifact → Task 4; §7 deploy recipe → Task 5; §8 testing (contract + glue unit + integration) → Tasks 1–3; §9 ADR-0014 → Task 6; §10 milestone update → Task 6. All spec sections map to a task.
- **Placeholder scan:** no TBD/TODO; every code step shows complete code; every command shows expected output.
- **Type consistency:** `createMongoRepository({ db })`, `ensureIndexes(db)`, and `createNextHandler(server)` are named identically across the repository, tests, integration test, recipe, and check-exports. The `Repository` method signatures match `@comments/server`'s interface (`Scope`/`ThreadId`/`ThreadStatus`/`AnchorPatch`/`NewThread`/`NewComment`/`ListQuery`/`ListResult`). Cursor helpers reuse the server's `encodeCursor`/`decodeCursor` (`{ updatedAt, id }`).
