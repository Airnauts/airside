# Uniform Adapter Construction + `@airnauts/comments-next` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every persistence/storage adapter a uniform factory shape (`memoryRepository()`, `mongoRepository({uri})`, `fileSystemStorage({rootDir, baseUrl})`, `vercelBlobStorage({...})`), extract the in-memory backend and a generic connection-memoization primitive into their own homes, and add a `@airnauts/comments-next` package so a Next.js host integrates in a single route file with zero glue.

**Architecture:** A pure `lazyRepository` primitive lands in `@airnauts/comments-server` (memoizes a lazily-connected `Repository` on a `globalThis` registry). `InMemoryRepository` moves out of `server` into a new `@airnauts/comments-adapter-memory`. `adapter-mongo` gains a `mongoRepository({uri})` factory built on `lazyRepository`. The two storage adapters gain factory functions (and FS gains a `baseUrl` option that folds the example's url-rewrite glue into config). A new `@airnauts/comments-next` exposes `createCommentsRoute(config)` wrapping the existing `createNextHandler`. The example host is then reduced to one route file.

**Tech Stack:** TypeScript (ESM), pnpm workspaces, tsup + `tsc --build` (project references), Vitest, `mongodb` / `mongodb-memory-server`, Changesets.

**Spec:** `docs/superpowers/specs/2026-06-02-uniform-adapter-construction-design.md`

**Conventions (match the existing packages):**
- Backend is **test-first** (ADR-0010): write the failing test, watch it fail, implement, watch it pass, commit.
- Every published package's `tsup.config.ts` sets `clean: true` (ADR-0019); `tsconfig.json` sets `emitDeclarationOnly: true` and lists `references`; `package.json` uses `"build": "tsup && tsc --build"`, `"test": "vitest run"`.
- **Build orchestration gotcha:** each package's runtime JS is produced by `tsup`; `tsc --build` emits only `.d.ts`. So a test that imports another workspace package's *runtime values* needs that package's `dist/index.js` to exist. Turbo's `test` task `dependsOn: ["^build"]`, so **run cross-package tests through turbo** — `pnpm exec turbo run test --filter=<pkg>` builds the package's dependencies first, then runs its vitest. A test that imports another package only via `import type` (erased at runtime) can use the faster `pnpm --filter <pkg> test` directly. After any `package.json` dependency change run `pnpm install` from the repo root.
- All work happens in the current worktree on branch `comments-next-spec`. Commit after each task.

**File structure (created / modified):**
- `packages/server/src/repository/lazy.ts` + `lazy.test.ts` — new primitive; `src/index.ts` re-export; **remove** `InMemoryRepository` export.
- `packages/adapter-memory/**` — new package; receives `in-memory.ts` + `in-memory.test.ts` moved from `server`, adds `memoryRepository()`.
- `packages/adapter-mongo/src/repository.ts` (add `mongoRepository` + `connectMongo`) + `mongo-repository.test.ts` (new) + `src/index.ts` export.
- `packages/storage-fs/src/index.ts` (add `baseUrl` + `fileSystemStorage`) + `index.test.ts` (add cases).
- `packages/storage-vercel-blob/src/index.ts` (add `vercelBlobStorage`) + `index.test.ts` (add case).
- `packages/next/**` — new package; `createCommentsRoute`.
- `examples/nextjs-host/**` — delete 3 `lib/` files, rewrite the route, update deps.
- `tsconfig.json` (root references), `docs/adr.md` (two ADRs), `.changeset/*.md` (release).

---

## Task 1: `lazyRepository` primitive in `@airnauts/comments-server`

**Files:**
- Create: `packages/server/src/repository/lazy.ts`
- Test: `packages/server/src/repository/lazy.test.ts`
- Modify: `packages/server/src/index.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/server/src/repository/lazy.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { lazyRepository } from './lazy'
import type { ListQuery, Repository } from './types'

// A minimal Repository whose listThreads echoes a sentinel cursor so we can
// assert which underlying instance answered. Other methods are unused here.
function stubRepo(cursor: string | null): Repository {
  return {
    async createThread() {
      return {} as never
    },
    async getThread() {
      return null
    },
    async listThreads() {
      return { threads: [], nextCursor: cursor }
    },
    async addComment() {
      return {} as never
    },
    async setStatus() {
      return {} as never
    },
    async updateAnchor() {
      return {} as never
    },
  }
}

const query: ListQuery = { projectId: 'p', sort: 'updatedAt', limit: 10 }

beforeEach(() => {
  // Reset the cross-call registry between tests.
  ;(globalThis as unknown as { __commentsRepos?: unknown }).__commentsRepos = undefined
})

describe('lazyRepository', () => {
  it('does not connect until the first method call', () => {
    const connect = vi.fn(async () => stubRepo('a'))
    lazyRepository(connect, { cacheKey: 'k1' })
    expect(connect).not.toHaveBeenCalled()
  })

  it('connects once and memoizes across calls with the same cacheKey', async () => {
    const connect = vi.fn(async () => stubRepo('a'))
    const repo = lazyRepository(connect, { cacheKey: 'k2' })
    await repo.listThreads(query)
    await repo.listThreads(query)
    const repo2 = lazyRepository(connect, { cacheKey: 'k2' })
    await repo2.listThreads(query)
    expect(connect).toHaveBeenCalledTimes(1)
  })

  it('uses a separate connection per cacheKey', async () => {
    const connect = vi.fn(async () => stubRepo('a'))
    await lazyRepository(connect, { cacheKey: 'A' }).listThreads(query)
    await lazyRepository(connect, { cacheKey: 'B' }).listThreads(query)
    expect(connect).toHaveBeenCalledTimes(2)
  })

  it('forwards results from the underlying repository', async () => {
    const repo = lazyRepository(async () => stubRepo('hello'), { cacheKey: 'k3' })
    expect((await repo.listThreads(query)).nextCursor).toBe('hello')
  })

  it('clears the cache on connect failure so the next call retries', async () => {
    let n = 0
    const connect = vi.fn(async () => {
      n += 1
      if (n === 1) throw new Error('boom')
      return stubRepo('ok')
    })
    const repo = lazyRepository(connect, { cacheKey: 'k4' })
    await expect(repo.listThreads(query)).rejects.toThrow('boom')
    expect((await repo.listThreads(query)).nextCursor).toBe('ok')
    expect(connect).toHaveBeenCalledTimes(2)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @airnauts/comments-server test -- lazy`
Expected: FAIL — `Failed to resolve import "./lazy"` (module does not exist yet).

- [ ] **Step 3: Write the implementation**

Create `packages/server/src/repository/lazy.ts`:

```ts
import type { ThreadId, ThreadStatus } from '@airnauts/comments-core'
import type { AnchorPatch, ListQuery, NewComment, NewThread, Repository, Scope } from './types'

// One connected Repository per cacheKey, memoized across warm serverless
// invocations / HMR reloads via a single globalThis registry.
const globalForRepos = globalThis as unknown as {
  __commentsRepos?: Map<string, Promise<Repository>>
}

function registry(): Map<string, Promise<Repository>> {
  globalForRepos.__commentsRepos ??= new Map<string, Promise<Repository>>()
  return globalForRepos.__commentsRepos
}

/**
 * Wraps an async `connect` in a `Repository` that builds synchronously (so a
 * server can be constructed at module load without awaiting) and connects on the
 * first method call. The connected repository is memoized under `cacheKey`; a
 * failed connect clears the entry so the next call retries.
 */
export function lazyRepository(
  connect: () => Promise<Repository>,
  opts: { cacheKey: string },
): Repository {
  const { cacheKey } = opts
  const get = (): Promise<Repository> => {
    const repos = registry()
    let pending = repos.get(cacheKey)
    if (!pending) {
      pending = connect().catch((err: unknown) => {
        repos.delete(cacheKey) // allow a retry on the next call
        return Promise.reject(err)
      })
      repos.set(cacheKey, pending)
    }
    return pending
  }
  return {
    createThread: (input: NewThread) => get().then((r) => r.createThread(input)),
    getThread: (scope: Scope, id: ThreadId) => get().then((r) => r.getThread(scope, id)),
    listThreads: (query: ListQuery) => get().then((r) => r.listThreads(query)),
    addComment: (scope: Scope, threadId: ThreadId, comment: NewComment) =>
      get().then((r) => r.addComment(scope, threadId, comment)),
    setStatus: (scope: Scope, threadId: ThreadId, status: ThreadStatus, now: string) =>
      get().then((r) => r.setStatus(scope, threadId, status, now)),
    updateAnchor: (scope: Scope, threadId: ThreadId, patch: AnchorPatch, now: string) =>
      get().then((r) => r.updateAnchor(scope, threadId, patch, now)),
  }
}
```

- [ ] **Step 4: Export it from the package index**

In `packages/server/src/index.ts`, add after the `decodeCursor`/`encodeCursor` export (line 5):

```ts
export { lazyRepository } from './repository/lazy'
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm --filter @airnauts/comments-server test -- lazy`
Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/repository/lazy.ts packages/server/src/repository/lazy.test.ts packages/server/src/index.ts
git commit -m "feat(server): add lazyRepository connection-memoization primitive"
```

---

## Task 2: Extract `@airnauts/comments-adapter-memory`

Moves `InMemoryRepository` out of `server` into a new package, adds the `memoryRepository()` factory, and rewires every test that imported the class. This is one atomic task: `server` does not compile its tests until all imports are updated, so finish the whole task before running the full suite.

**Files:**
- Create: `packages/adapter-memory/package.json`, `tsconfig.json`, `tsup.config.ts`, `vitest.config.ts`, `README.md`
- Move: `packages/server/src/repository/in-memory.ts` → `packages/adapter-memory/src/in-memory.ts`; `…/in-memory.test.ts` → `packages/adapter-memory/src/in-memory.test.ts`
- Create: `packages/adapter-memory/src/index.ts`, `packages/adapter-memory/src/memory-repository.test.ts`
- Modify: `packages/server/src/index.ts`, `packages/server/package.json`, `packages/client/package.json`, `tsconfig.json` (root), and ~10 server/client test files' imports

- [ ] **Step 1: Scaffold the package files**

Create `packages/adapter-memory/package.json`:

```json
{
  "name": "@airnauts/comments-adapter-memory",
  "version": "0.0.0",
  "description": "In-memory repository adapter for the Airnauts commenting tool server.",
  "keywords": ["comments", "commenting", "annotations", "feedback", "airnauts", "in-memory", "adapter"],
  "license": "MIT",
  "author": "Airnauts",
  "homepage": "https://github.com/Airnauts/commenting-tool#readme",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/Airnauts/commenting-tool.git",
    "directory": "packages/adapter-memory"
  },
  "bugs": { "url": "https://github.com/Airnauts/commenting-tool/issues" },
  "type": "module",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "files": ["dist", "!dist/.tsbuildinfo", "README.md", "LICENSE"],
  "publishConfig": { "access": "public" },
  "scripts": {
    "build": "tsup && tsc --build",
    "typecheck": "tsc --build",
    "test": "vitest run"
  },
  "dependencies": {
    "@airnauts/comments-core": "workspace:^",
    "@airnauts/comments-server": "workspace:^"
  },
  "devDependencies": {
    "@airnauts/comments-test-support": "workspace:*"
  }
}
```

Create `packages/adapter-memory/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist",
    "emitDeclarationOnly": true,
    "tsBuildInfoFile": "dist/.tsbuildinfo"
  },
  "include": ["src/**/*"],
  "exclude": ["dist", "node_modules", "src/**/*.test.ts"],
  "references": [{ "path": "../core" }, { "path": "../server" }]
}
```

Create `packages/adapter-memory/tsup.config.ts`:

```ts
import { defineConfig } from 'tsup'

export default defineConfig({
  entry: { index: 'src/index.ts' },
  format: ['esm'],
  dts: false,
  sourcemap: true,
  outDir: 'dist',
  // Clean the whole dist (incl. stale .tsbuildinfo) so the following
  // `tsc --build` always full-rebuilds and re-emits .d.ts (ADR-0019).
  clean: true,
})
```

Create `packages/adapter-memory/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    name: 'adapter-memory',
    environment: 'node',
  },
})
```

Create `packages/adapter-memory/README.md`:

```md
# @airnauts/comments-adapter-memory

In-memory `Repository` adapter for the Airnauts commenting tool — ephemeral,
process-local storage for local development and tests.

```ts
import { memoryRepository } from '@airnauts/comments-adapter-memory'

const repository = memoryRepository()
```
```

- [ ] **Step 2: Move the implementation and its test**

```bash
git mv packages/server/src/repository/in-memory.ts packages/adapter-memory/src/in-memory.ts
git mv packages/server/src/repository/in-memory.test.ts packages/adapter-memory/src/in-memory.test.ts
```

- [ ] **Step 3: Fix the moved implementation's imports**

In `packages/adapter-memory/src/in-memory.ts`, replace the top import block (the `../cursor` and `./types` imports) so the types and cursor codec come from the published `server` entry. Replace lines 1–11:

```ts
import type { Thread, ThreadId, ThreadListItem, ThreadStatus } from '@airnauts/comments-core'
import { decodeCursor, encodeCursor } from '../cursor'
import type {
  AnchorPatch,
  ListQuery,
  ListResult,
  NewComment,
  NewThread,
  Repository,
  Scope,
} from './types'
```

with:

```ts
import type { Thread, ThreadId, ThreadListItem, ThreadStatus } from '@airnauts/comments-core'
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
} from '@airnauts/comments-server'
```

(The rest of the file is unchanged.)

- [ ] **Step 4: Fix the moved test's import**

In `packages/adapter-memory/src/in-memory.test.ts`, the import `from './in-memory'` already resolves in the new location — no change needed. Confirm it reads:

```ts
import { repositoryContract } from '@airnauts/comments-test-support'
import { InMemoryRepository } from './in-memory'

repositoryContract('InMemoryRepository', async () => new InMemoryRepository())
```

- [ ] **Step 5: Add the package index and the factory test**

Create `packages/adapter-memory/src/index.ts`:

```ts
import type { Repository } from '@airnauts/comments-server'
import { InMemoryRepository } from './in-memory'

export { InMemoryRepository } from './in-memory'

/** Fresh, process-local in-memory `Repository`. No connection, no config. */
export function memoryRepository(): Repository {
  return new InMemoryRepository()
}
```

Create `packages/adapter-memory/src/memory-repository.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { InMemoryRepository, memoryRepository } from './index'

describe('memoryRepository', () => {
  it('returns a fresh InMemoryRepository on each call (no shared state)', () => {
    const a = memoryRepository()
    const b = memoryRepository()
    expect(a).toBeInstanceOf(InMemoryRepository)
    expect(a).not.toBe(b)
  })
})
```

- [ ] **Step 6: Remove `InMemoryRepository` from the server index**

In `packages/server/src/index.ts`, delete this line (line 20):

```ts
export { InMemoryRepository } from './repository/in-memory'
```

Leave the `export type { … } from './repository/types'` block intact — those types stay in `server`.

- [ ] **Step 7: Repoint server + client test imports at the new package**

Replace every `InMemoryRepository` import that pointed at the moved file. The affected server files and their current import lines:

- `packages/server/src/dev.test.ts:5` — `from './repository/in-memory'`
- `packages/server/src/next.test.ts:5` — `from './repository/in-memory'`
- `packages/server/src/use-cases/add-comment.test.ts:6` — `from '../repository/in-memory'`
- `packages/server/src/use-cases/get-thread.test.ts:6` — `from '../repository/in-memory'`
- `packages/server/src/use-cases/list-threads.test.ts:6` — `from '../repository/in-memory'`
- `packages/server/src/use-cases/refresh-anchor.test.ts:6` — `from '../repository/in-memory'`
- `packages/server/src/use-cases/create-thread.test.ts:5` — `from '../repository/in-memory'`
- `packages/server/src/use-cases/set-thread-status.test.ts:6` — `from '../repository/in-memory'`
- `packages/server/src/__tests__/pipeline.test.ts:4` — `from '../repository/in-memory'`

In each, change the import source to `@airnauts/comments-adapter-memory`, e.g.:

```ts
import { InMemoryRepository } from '@airnauts/comments-adapter-memory'
```

For the client test, `packages/client/src/api/round-trip.test.ts`, `InMemoryRepository`
is bundled into a multi-symbol import from `@airnauts/comments-server` — split it out.
Replace lines 2–6:

```ts
import {
  createCommentsServer,
  InMemoryRepository,
  type StorageAdapter,
} from '@airnauts/comments-server'
```

with:

```ts
import { InMemoryRepository } from '@airnauts/comments-adapter-memory'
import { createCommentsServer, type StorageAdapter } from '@airnauts/comments-server'
```

After editing, verify nothing still imports the old internal path, and that no file
still imports `InMemoryRepository` from `@airnauts/comments-server`:

```bash
grep -rn "repository/in-memory" packages --include="*.ts"
grep -rn "InMemoryRepository" packages --include="*.ts" | grep "comments-server"
```

Expected: both produce no matches (empty output).

- [ ] **Step 8: Add the dev dependency to server and client**

In `packages/server/package.json` `devDependencies`, add:

```json
"@airnauts/comments-adapter-memory": "workspace:*"
```

In `packages/client/package.json` `devDependencies`, add the same line.

- [ ] **Step 9: Register the package in the root tsconfig references**

In `tsconfig.json` (root), add to `references`:

```json
{ "path": "packages/adapter-memory" }
```

- [ ] **Step 10: Teach turbo that server tests now need the memory adapter built**

`turbo.json` has a package-specific override for `@airnauts/comments-server#test` that
lists explicit build deps instead of using `^build`. Server's tests now import
`InMemoryRepository` from the new package, so add its build. Change:

```json
    "@airnauts/comments-server#test": {
      "dependsOn": ["@airnauts/comments-core#build", "@airnauts/comments-test-support#build"]
    },
```

to:

```json
    "@airnauts/comments-server#test": {
      "dependsOn": [
        "@airnauts/comments-core#build",
        "@airnauts/comments-test-support#build",
        "@airnauts/comments-adapter-memory#build"
      ]
    },
```

(`@airnauts/comments-client#test` uses the generic `test` task, whose `^build` already
includes the new devDependency — no override change needed there.)

- [ ] **Step 11: Install, build, and run the affected suites**

```bash
pnpm install
pnpm exec turbo run test --filter=@airnauts/comments-adapter-memory --filter=@airnauts/comments-server --filter=@airnauts/comments-client
```

Expected: all green. Turbo builds the dependency dist first (`core`, `server`, `test-support`, `adapter-memory`). `adapter-memory` runs the moved `repositoryContract` + the new factory test; `server`/`client` tests resolve `InMemoryRepository` from the new package's `dist`.

- [ ] **Step 12: Commit**

```bash
git add packages/adapter-memory packages/server packages/client tsconfig.json turbo.json
git commit -m "refactor: extract InMemoryRepository into @airnauts/comments-adapter-memory"
```

---

## Task 3: `mongoRepository({ uri })` in `@airnauts/comments-adapter-mongo`

**Files:**
- Modify: `packages/adapter-mongo/src/repository.ts`, `packages/adapter-mongo/src/index.ts`
- Test: `packages/adapter-mongo/src/mongo-repository.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/adapter-mongo/src/mongo-repository.test.ts`:

```ts
import type { ListQuery } from '@airnauts/comments-server'
import { MongoMemoryServer } from 'mongodb-memory-server'
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest'
import { mongoRepository } from './index'

let mongod: MongoMemoryServer
let uri: string

beforeAll(async () => {
  mongod = await MongoMemoryServer.create()
  uri = mongod.getUri()
}, 60_000)

afterAll(async () => {
  // mongoRepository intentionally leaves its MongoClient open for the process
  // lifetime; `vitest run` exits the process, so the open handle is harmless.
  await mongod?.stop()
})

beforeEach(() => {
  ;(globalThis as unknown as { __commentsRepos?: unknown }).__commentsRepos = undefined
})

const query: ListQuery = { projectId: 'p', sort: 'updatedAt', limit: 10 }

it('lazily connects, ensures indexes, and serves queries', async () => {
  const repo = mongoRepository({ uri })
  expect(await repo.listThreads(query)).toEqual({ threads: [], nextCursor: null })
})

it('memoizes one connection per cacheKey across calls', async () => {
  const repo = mongoRepository({ uri })
  await repo.listThreads(query)
  const repos = (globalThis as unknown as { __commentsRepos: Map<string, unknown> })
    .__commentsRepos
  const cached = repos.get('mongo')
  const repo2 = mongoRepository({ uri })
  await repo2.listThreads(query)
  expect(repos.get('mongo')).toBe(cached)
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec turbo run test --filter=@airnauts/comments-adapter-mongo`
(Turbo builds `server`'s dist first — the adapter imports `lazyRepository`/`createMongoRepository` at runtime.)
Expected: FAIL — `mongoRepository` is not exported from `./index`. (First run also downloads the `mongodb-memory-server` binary.)

- [ ] **Step 3: Implement the factory**

In `packages/adapter-mongo/src/repository.ts`, update the imports and append the factory. The current `mongodb` type import (line ~30) is:

```ts
import type { Db, Filter, UpdateFilter } from 'mongodb'
```

Change it to also import the runtime `MongoClient`:

```ts
import { type Db, type Filter, MongoClient, type UpdateFilter } from 'mongodb'
```

Update the `@airnauts/comments-server` import to also bring in `lazyRepository` (it currently imports only types). Change:

```ts
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
} from '@airnauts/comments-server'
```

to add `lazyRepository`:

```ts
import {
  type AnchorPatch,
  decodeCursor,
  encodeCursor,
  lazyRepository,
  type ListQuery,
  type ListResult,
  type NewComment,
  type NewThread,
  type Repository,
  type Scope,
} from '@airnauts/comments-server'
```

Add `ensureIndexes` to the imports from `./indexes` at the top of the file (add this import near the other local imports):

```ts
import { ensureIndexes } from './indexes'
```

Then append at the end of the file:

```ts
/** Open one client, connect, ensure indexes, and build the repository. */
async function connectMongo(uri: string): Promise<Repository> {
  const client = new MongoClient(uri)
  await client.connect() // intentionally left open for the process lifetime
  const db = client.db() // database name comes from the connection string
  await ensureIndexes(db)
  return createMongoRepository({ db })
}

/**
 * Host-facing Mongo `Repository`: connects lazily on first use and memoizes the
 * connection (warm serverless / HMR reuse) under `cacheKey`. The single function
 * a host imports — `createMongoRepository`/`ensureIndexes` remain for callers
 * that own their own connection.
 *
 * `cacheKey` defaults to `'mongo'`. If you connect to more than one database in the
 * same process, pass a distinct `cacheKey` per connection — otherwise the second
 * call reuses the first connection under the shared default key.
 */
export function mongoRepository({
  uri,
  cacheKey = 'mongo',
}: {
  uri: string
  cacheKey?: string
}): Repository {
  return lazyRepository(() => connectMongo(uri), { cacheKey })
}
```

- [ ] **Step 4: Export from the package index**

In `packages/adapter-mongo/src/index.ts`, add `mongoRepository` to the repository export:

```ts
export { ensureIndexes } from './indexes'
export { createMongoRepository, mongoRepository } from './repository'
```

- [ ] **Step 5: Run the full adapter suite (new lifecycle test + existing contract test)**

Run: `pnpm exec turbo run test --filter=@airnauts/comments-adapter-mongo`
Expected: PASS — the new `mongo-repository.test.ts` (2 tests) plus the unchanged `repository.test.ts` (contract + index specs). Turbo rebuilds `server`'s dist so the new `lazyRepository` export is available.

- [ ] **Step 6: Commit**

```bash
git add packages/adapter-mongo/src/repository.ts packages/adapter-mongo/src/index.ts packages/adapter-mongo/src/mongo-repository.test.ts
git commit -m "feat(adapter-mongo): add memoized mongoRepository({uri}) factory"
```

---

## Task 4: `fileSystemStorage` + `baseUrl` in `@airnauts/comments-storage-fs`

**Files:**
- Modify: `packages/storage-fs/src/index.ts`
- Test: `packages/storage-fs/src/index.test.ts`

- [ ] **Step 1: Write the failing tests**

This file **already exists** and already imports `mkdtempSync` (`node:fs`), `tmpdir`
(`node:os`), and `join` (`node:path`) for its `storageContract` block — do **not**
re-import them (duplicate declarations won't compile). Make two edits:

1. Add `fileSystemStorage` to the existing `./index` import — change
   `import { FileSystemStorage } from './index'` to:

   ```ts
   import { FileSystemStorage, fileSystemStorage } from './index'
   ```

2. Add a `vitest` import (the file currently has none — globals are off in this repo)
   and the new `describe` block, **below** the existing `storageContract(...)` call:

```ts
import { describe, expect, it } from 'vitest'

function blob(name = 'a.bin') {
  return { data: new Uint8Array([1, 2, 3]), contentType: 'application/octet-stream', name }
}

describe('fileSystemStorage baseUrl', () => {
  it('returns a baseUrl-relative url when baseUrl is set', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'comments-storage-fs-'))
    const store = fileSystemStorage({ rootDir: dir, baseUrl: '/uploads' })
    const res = await store.put(blob())
    expect(res.url).toBe(`/uploads/${res.key}`)
  })

  it('strips a trailing slash on baseUrl', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'comments-storage-fs-'))
    const store = fileSystemStorage({ rootDir: dir, baseUrl: '/uploads/' })
    const res = await store.put(blob())
    expect(res.url).toBe(`/uploads/${res.key}`)
  })

  it('falls back to a file:// url when baseUrl is absent', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'comments-storage-fs-'))
    const store = fileSystemStorage({ rootDir: dir })
    const res = await store.put(blob())
    expect(res.url.startsWith('file://')).toBe(true)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm exec turbo run test --filter=@airnauts/comments-storage-fs`
Expected: FAIL — `fileSystemStorage` is not exported; `baseUrl` not honored.

- [ ] **Step 3: Implement `baseUrl` + the factory**

In `packages/storage-fs/src/index.ts`:

Add `baseUrl` to the options type:

```ts
export type FileSystemStorageOptions = {
  rootDir: string
  /**
   * Public URL base. When set, `put` returns `${baseUrl}/${key}` (a browser-served
   * path) instead of a `file://` URL. A trailing slash is trimmed.
   */
  baseUrl?: string
}
```

In `FileSystemStorage.put`, replace the returned `url` so it honors `baseUrl` (keys use posix separators, so they are URL-safe):

```ts
    return {
      key,
      url: this.opts.baseUrl
        ? `${this.opts.baseUrl.replace(/\/$/, '')}/${key}`
        : pathToFileURL(abs).href,
      size: bytes.byteLength,
    }
```

Add the factory below the class (before the `packageName` export):

```ts
/** Construct a filesystem `StorageAdapter` (uniform `xxxStorage(config)` shape). */
export function fileSystemStorage(opts: FileSystemStorageOptions): StorageAdapter {
  return new FileSystemStorage(opts)
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm exec turbo run test --filter=@airnauts/comments-storage-fs`
Expected: PASS — the new `baseUrl` cases plus the unchanged `storageContract` round-trip.

- [ ] **Step 5: Commit**

```bash
git add packages/storage-fs/src/index.ts packages/storage-fs/src/index.test.ts
git commit -m "feat(storage-fs): add baseUrl option and fileSystemStorage factory"
```

---

## Task 5: `vercelBlobStorage` in `@airnauts/comments-storage-vercel-blob`

**Files:**
- Modify: `packages/storage-vercel-blob/src/index.ts`
- Test: `packages/storage-vercel-blob/src/index.test.ts`

- [ ] **Step 1: Write the failing test**

This file **already exists** and already imports `{ afterAll, describe, it }` from
`vitest` and `{ VercelBlobStorage }` from `./index` — merge, don't duplicate. Make two
edits:

1. Add `expect` to the vitest import — change `import { afterAll, describe, it } from 'vitest'`
   to `import { afterAll, describe, expect, it } from 'vitest'`.
2. Add `vercelBlobStorage` to the `./index` import — change
   `import { VercelBlobStorage } from './index'` to
   `import { VercelBlobStorage, vercelBlobStorage } from './index'`.

Then append the new block at the end of the file:

```ts
describe('vercelBlobStorage', () => {
  it('returns a StorageAdapter', () => {
    const store = vercelBlobStorage({ token: 'test-token' })
    expect(typeof store.put).toBe('function')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec turbo run test --filter=@airnauts/comments-storage-vercel-blob`
Expected: FAIL — `vercelBlobStorage` is not exported.

- [ ] **Step 3: Implement the factory**

In `packages/storage-vercel-blob/src/index.ts`, add below the `VercelBlobStorage` class (before the `packageName` export):

```ts
/** Construct a Vercel Blob `StorageAdapter` (uniform `xxxStorage(config)` shape). */
export function vercelBlobStorage(opts: VercelBlobStorageOptions = {}): StorageAdapter {
  return new VercelBlobStorage(opts)
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec turbo run test --filter=@airnauts/comments-storage-vercel-blob`
Expected: PASS — the new factory test plus the unchanged existing coverage.

- [ ] **Step 5: Commit**

```bash
git add packages/storage-vercel-blob/src/index.ts packages/storage-vercel-blob/src/index.test.ts
git commit -m "feat(storage-vercel-blob): add vercelBlobStorage factory"
```

---

## Task 6: `@airnauts/comments-next` package with `createCommentsRoute`

**Files:**
- Create: `packages/next/package.json`, `tsconfig.json`, `tsup.config.ts`, `vitest.config.ts`, `README.md`, `src/index.ts`
- Test: `packages/next/src/index.test.ts`
- Modify: `tsconfig.json` (root)

- [ ] **Step 1: Scaffold the package files**

Create `packages/next/package.json`:

```json
{
  "name": "@airnauts/comments-next",
  "version": "0.0.0",
  "description": "Next.js App Router integration for the Airnauts commenting tool server.",
  "keywords": ["comments", "commenting", "annotations", "feedback", "airnauts", "next", "nextjs"],
  "license": "MIT",
  "author": "Airnauts",
  "homepage": "https://github.com/Airnauts/commenting-tool#readme",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/Airnauts/commenting-tool.git",
    "directory": "packages/next"
  },
  "bugs": { "url": "https://github.com/Airnauts/commenting-tool/issues" },
  "type": "module",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "files": ["dist", "!dist/.tsbuildinfo", "README.md", "LICENSE"],
  "publishConfig": { "access": "public" },
  "scripts": {
    "build": "tsup && tsc --build",
    "typecheck": "tsc --build",
    "test": "vitest run"
  },
  "dependencies": {
    "@airnauts/comments-server": "workspace:^"
  },
  "devDependencies": {
    "@airnauts/comments-adapter-memory": "workspace:*",
    "@airnauts/comments-core": "workspace:*",
    "@airnauts/comments-test-support": "workspace:*"
  }
}
```

Create `packages/next/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist",
    "emitDeclarationOnly": true,
    "tsBuildInfoFile": "dist/.tsbuildinfo"
  },
  "include": ["src/**/*"],
  "exclude": ["dist", "node_modules", "src/**/*.test.ts"],
  "references": [{ "path": "../server" }]
}
```

Create `packages/next/tsup.config.ts`:

```ts
import { defineConfig } from 'tsup'

export default defineConfig({
  entry: { index: 'src/index.ts' },
  format: ['esm'],
  dts: false,
  sourcemap: true,
  outDir: 'dist',
  // Clean the whole dist (incl. stale .tsbuildinfo) so the following
  // `tsc --build` always full-rebuilds and re-emits .d.ts (ADR-0019).
  clean: true,
})
```

Create `packages/next/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    name: 'next',
    environment: 'node',
  },
})
```

Create `packages/next/README.md`:

```md
# @airnauts/comments-next

Next.js App Router integration for the Airnauts commenting tool. Build the server
and its catch-all route handlers in one call:

```ts
// app/api/comments/[...path]/route.ts
import { createCommentsRoute } from '@airnauts/comments-next'
import { memoryRepository } from '@airnauts/comments-adapter-memory'

export const { GET, POST, PATCH, OPTIONS } = createCommentsRoute({
  secretKey: process.env.COMMENTS_SECRET!,
  projectId: 'my-app',
  allowedOrigins: ['http://localhost:3000'],
  repository: memoryRepository(),
  storage,
})
```
```

- [ ] **Step 2: Write the failing test**

Create `packages/next/src/index.test.ts`:

```ts
import { KEY_HEADER_NAME } from '@airnauts/comments-core'
import { memoryRepository } from '@airnauts/comments-adapter-memory'
import type { StorageAdapter } from '@airnauts/comments-server'
import { makeCreateThreadBody } from '@airnauts/comments-test-support'
import { describe, expect, it } from 'vitest'
import { createCommentsRoute } from './index'

const stubStorage: StorageAdapter = {
  async put() {
    return { url: 'https://blob.test/x', key: 'x', size: 0 }
  },
}

function build() {
  return createCommentsRoute({
    secretKey: 'sk_test',
    projectId: 'proj_x',
    allowedOrigins: ['https://app.example.com'],
    repository: memoryRepository(),
    storage: stubStorage,
    rateLimit: false,
  })
}

const headers = {
  origin: 'https://app.example.com',
  [KEY_HEADER_NAME]: 'sk_test',
  'content-type': 'application/json',
}

describe('createCommentsRoute', () => {
  it('round-trips create → get through the returned handlers', async () => {
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

    const got = await GET(new Request(`https://host/api/comments/threads/${id}`, { headers }), {
      params: Promise.resolve({ path: ['threads', id] }),
    })
    expect(got.status).toBe(200)
    expect((await got.json()).id).toBe(id)
  })

  it('also returns the underlying server', () => {
    const route = build()
    expect(typeof route.server.handle).toBe('function')
  })
})
```

- [ ] **Step 3: Install, then run the test to verify it fails**

```bash
pnpm install   # register the new package + its workspace deps
pnpm exec turbo run test --filter=@airnauts/comments-next
```
Expected: FAIL — `./index` does not exist / `createCommentsRoute` undefined. (Turbo builds `server` + `adapter-memory` dist first — the test imports both at runtime.)

- [ ] **Step 4: Implement `createCommentsRoute`**

Create `packages/next/src/index.ts`:

```ts
import type { CommentsServer, CreateCommentsServerOptions } from '@airnauts/comments-server'
import { createCommentsServer } from '@airnauts/comments-server'
import { createNextHandler } from '@airnauts/comments-server/next'

type NextRouteHandlers = ReturnType<typeof createNextHandler>

/**
 * Build the commenting server and its Next App Router catch-all handlers in one
 * call. Mount as `app/api/comments/[...path]/route.ts`:
 *
 *   export const { GET, POST, PATCH, OPTIONS } = createCommentsRoute(config)
 *
 * Also returns `server` for hosts that need server-side reads, extra routes, or
 * server access in tests.
 */
export function createCommentsRoute(
  config: CreateCommentsServerOptions,
): NextRouteHandlers & { server: CommentsServer } {
  const server = createCommentsServer(config)
  return { ...createNextHandler(server), server }
}
```

- [ ] **Step 5: Register in the root tsconfig references**

In `tsconfig.json` (root) `references`, add (needed for the full `pnpm build` in Task 9):

```json
{ "path": "packages/next" }
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `pnpm exec turbo run test --filter=@airnauts/comments-next`
Expected: PASS (2 tests). Turbo builds `server` + `adapter-memory` dist first.

- [ ] **Step 7: Commit**

```bash
git add packages/next tsconfig.json
git commit -m "feat(next): add @airnauts/comments-next with createCommentsRoute"
```

---

## Task 7: Migrate `examples/nextjs-host` to zero glue

**Files:**
- Delete: `examples/nextjs-host/lib/mongo-repository.ts`, `examples/nextjs-host/lib/comments-server.ts`, `examples/nextjs-host/lib/public-uploads-storage.ts`
- Modify: `examples/nextjs-host/app/api/comments/[...path]/route.ts`, `examples/nextjs-host/package.json`

- [ ] **Step 1: Delete the glue files**

```bash
git rm examples/nextjs-host/lib/mongo-repository.ts examples/nextjs-host/lib/comments-server.ts examples/nextjs-host/lib/public-uploads-storage.ts
```

- [ ] **Step 2: Rewrite the route to the single-file integration**

Replace the entire contents of `examples/nextjs-host/app/api/comments/[...path]/route.ts` with:

```ts
import { join } from 'node:path'
import { memoryRepository } from '@airnauts/comments-adapter-memory'
import { mongoRepository } from '@airnauts/comments-adapter-mongo'
import { createCommentsRoute } from '@airnauts/comments-next'
import { fileSystemStorage } from '@airnauts/comments-storage-fs'
import { vercelBlobStorage } from '@airnauts/comments-storage-vercel-blob'

export const { GET, POST, PATCH, OPTIONS } = createCommentsRoute({
  secretKey: 'dev-key', // demo only — replace with a real secret in production
  projectId: 'nextjs-host',
  allowedOrigins: ['http://localhost:3000', 'http://127.0.0.1:3000'],
  // Mongo when MONGODB_URI is set, else ephemeral in-memory.
  repository: process.env.MONGODB_URI
    ? mongoRepository({ uri: process.env.MONGODB_URI })
    : memoryRepository(),
  // Vercel Blob when its token is present, else local public/uploads.
  storage: process.env.BLOB_READ_WRITE_TOKEN
    ? vercelBlobStorage()
    : fileSystemStorage({ rootDir: join(process.cwd(), 'public', 'uploads'), baseUrl: '/uploads' }),
  rateLimit: false,
})
```

- [ ] **Step 3: Update the example's dependencies**

In `examples/nextjs-host/package.json` `dependencies`: add the four factory packages and drop the now-unused direct `mongodb` dep. The result:

```json
  "dependencies": {
    "@airnauts/comments-adapter-memory": "workspace:*",
    "@airnauts/comments-adapter-mongo": "workspace:*",
    "@airnauts/comments-client": "workspace:*",
    "@airnauts/comments-next": "workspace:*",
    "@airnauts/comments-server": "workspace:*",
    "@airnauts/comments-storage-fs": "workspace:*",
    "@airnauts/comments-storage-vercel-blob": "workspace:*",
    "next": "^15.1.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
```

(`@airnauts/comments-server` is kept — it provides the `StorageAdapter`/types and is the peer of the next package; `mongodb` is removed.)

- [ ] **Step 4: Install and verify the example builds**

```bash
pnpm install
pnpm exec turbo run build --filter=@airnauts/comments-nextjs-host
```

Expected: turbo builds all six dependency packages' dist first, then `next build` completes successfully. The route module type-checks and bundles against the published package entries.

- [ ] **Step 5: Confirm `lib/` has no commenting glue left**

```bash
ls examples/nextjs-host/lib
```

Expected: the directory is empty (or absent). The whole integration now lives in the one route file.

- [ ] **Step 6: Commit**

```bash
git add examples/nextjs-host
git commit -m "examples(nextjs-host): integrate via createCommentsRoute, delete lib glue"
```

---

## Task 8: ADRs + Changeset

**Files:**
- Modify: `docs/adr.md`
- Create: `.changeset/uniform-adapter-construction.md`

- [ ] **Step 1: Append the two ADRs**

Append to `docs/adr.md` (newest-last; use today's date `2026-06-02`). Use the next sequential numbers after the current last record (`ADR-0020`) — i.e. `ADR-0021` and `ADR-0022`:

```md
## ADR-0021 — Uniform adapter construction: one factory per adapter + the `lazyRepository` primitive; in-memory extracted to its own package

- **Status:** accepted
- **Date:** 2026-06-02

**Context.** The `Repository` and `StorageAdapter` interfaces are already uniform
(each enforced by a shared contract suite), but *construction* was not:
`new InMemoryRepository()` vs. `createMongoRepository({ db })` vs. hand-written host
glue that owned a `MongoClient` and memoized it. The memoization is not Mongo- or
Next-specific — any lazily-connecting backend (Postgres, Redis) needs the same
warm-serverless / HMR connection reuse. In-memory lived inside `server` while Mongo
was a standalone adapter.

**Decision.** Each adapter — including in-memory — is its own package exposing a
lowercase `xxxRepository(config)` / `xxxStorage(config)` factory over the existing
shared interface. Connection memoization is a single generic `lazyRepository(connect,
{ cacheKey })` primitive in `@airnauts/comments-server` (a `globalThis` registry keyed
by `cacheKey`, retry-on-failure). `mongoRepository({ uri })` is built on it;
`InMemoryRepository` moves to `@airnauts/comments-adapter-memory` and `server` stops
exporting it. Low-level constructs (`InMemoryRepository`, `createMongoRepository`,
`FileSystemStorage`, `VercelBlobStorage`) remain exported for advanced use. No
monolithic `createRepository({ driver })` dispatcher (it would force every driver
dependency into one module).

**Consequences.** Host construction is uniform; future Postgres/Redis adapters reuse
`lazyRepository`. `server` becomes a pure engine that depends on no concrete adapter.
A benign dev-only workspace cycle remains: `server`/`client` tests devDepend on
`@airnauts/comments-adapter-memory`, which depends on `server` — acyclic for
`tsc --build` (server's non-test build never imports memory) and allowed by pnpm.
`@airnauts/comments-adapter-memory` is a new published package.

## ADR-0022 — Next.js integration package (`@airnauts/comments-next`)

- **Status:** accepted
- **Date:** 2026-06-02

**Context.** Mounting the commenting server on Next App Router required hosts to
hand-wire `createCommentsServer` + `createNextHandler` plus repository/storage
construction across several `lib/` files. The only genuinely Next-shaped piece is the
route-handler wiring.

**Decision.** Add `@airnauts/comments-next` exposing `createCommentsRoute(config)`,
which builds the server and wraps it with the existing `createNextHandler`, returning
`{ GET, POST, PATCH, OPTIONS, server }`. The package reads no environment variables;
the mongo/memory and blob/fs switches stay host-owned in the single route file.

**Consequences.** A Next host integrates in one route file with no bespoke glue.
`@airnauts/comments-next` is a new published package; the example `nextjs-host` is
reduced to that one route file.
```

- [ ] **Step 2: Add the changeset**

Create `.changeset/uniform-adapter-construction.md`:

```md
---
"@airnauts/comments-server": minor
"@airnauts/comments-adapter-memory": minor
"@airnauts/comments-adapter-mongo": minor
"@airnauts/comments-storage-fs": minor
"@airnauts/comments-storage-vercel-blob": minor
"@airnauts/comments-next": minor
---

Uniform adapter construction: every repository/storage adapter now exposes a factory
function (`memoryRepository()`, `mongoRepository({ uri })`, `fileSystemStorage({ rootDir, baseUrl })`,
`vercelBlobStorage({ ... })`). Adds the `lazyRepository` connection-memoization
primitive to the server, extracts `InMemoryRepository` into the new
`@airnauts/comments-adapter-memory` package (it is no longer exported from
`@airnauts/comments-server`), adds a `baseUrl` option to the filesystem storage, and
adds the new `@airnauts/comments-next` package with `createCommentsRoute`.
```

- [ ] **Step 3: Verify the changeset references real packages**

Run: `pnpm changeset status`
Expected: lists the six packages with a `minor` bump and no errors about unknown packages.

- [ ] **Step 4: Commit**

```bash
git add docs/adr.md .changeset/uniform-adapter-construction.md
git commit -m "docs(adr): record uniform adapter construction + comments-next (ADR-0021, ADR-0022)"
```

---

## Task 9: Full-workspace verification

- [ ] **Step 1: Clean build of every package**

Run: `pnpm build`
Expected: all packages build; no TS7016 / "cannot find declaration" errors (ADR-0019 `clean: true` is set on every new `tsup.config.ts`).

- [ ] **Step 2: Full test suite**

Run: `pnpm test`
Expected: green across `core`, `server`, `client`, `adapter-memory`, `adapter-mongo`, `storage-fs`, `storage-vercel-blob`, `next`.

- [ ] **Step 3: Lint gate**

Run: `pnpm lint`
Expected: passes (biome). Fix any import-ordering / formatting findings the new files introduce.

- [ ] **Step 4: Final confirmation**

Confirm the deliverables against the spec: uniform factories exist for all four adapters; `lazyRepository` is exported from `server`; `InMemoryRepository` is no longer exported from `server` but is from `adapter-memory`; the example host is a single route file; two ADRs and a changeset are recorded. No further commit needed if Tasks 1–8 each committed cleanly.
```
