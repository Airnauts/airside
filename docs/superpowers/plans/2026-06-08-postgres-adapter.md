# Postgres Repository Adapter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `@airnauts/comments-adapter-postgres` — a second `Repository` concrete that passes the shared `repositoryContract`, so Postgres is a drop-in alternative to the MongoDB adapter.

**Architecture:** A driver-agnostic adapter that never owns its connection: `createPostgresRepository({ sql })` takes any executor satisfying `{ query(text, params): Promise<{ rows }> }` (pg.Pool, PGlite, Neon Pool). Data is stored hybrid — scalar columns (`project_id`, `env`, `page_key`, `status`, `updated_at`, `id`) for filtering/sorting plus a `doc jsonb` holding the full wire Thread. Mirrors the existing `packages/adapter-mongo` shape exactly (factory + lazy convenience + idempotent schema helper).

**Tech Stack:** TypeScript (ESM, tsup + `tsc --build`), Vitest, `@electric-sql/pglite` (in-process WASM Postgres) for hermetic contract tests, `pg` as an optional peer for the lazy convenience. Full design: `docs/superpowers/specs/2026-06-08-postgres-adapter-design.md`.

---

## File Structure

**New package `packages/adapter-postgres/`:**
- `package.json` — package manifest, mirrors `adapter-mongo`
- `tsconfig.json`, `tsup.config.ts`, `vitest.config.ts` — build/test config
- `README.md`, `LICENSE` — published docs/license
- `src/schema.ts` — `SqlExecutor` interface, DDL constants, `ensureSchema()`
- `src/repository.ts` — `createPostgresRepository`, `postgresRepository` convenience
- `src/index.ts` — public re-exports
- `src/schema.test.ts` — asserts `ensureSchema` creates the tables/index
- `src/repository.test.ts` — runs `repositoryContract('postgres', …)` against PGlite

**Repo-level edits:**
- `tsconfig.json` (root) — add the project reference
- `.changeset/config.json` — add the package to the `fixed` version group
- `.changeset/<name>.md` — the release changeset (minor)
- `docs/adr.md` — ADR-0035
- `docs/architecture.md` — note the new concrete

**Why these boundaries:** `schema.ts` owns the connection-seam type and DDL (no dependency on `repository.ts`); `repository.ts` imports from `schema.ts` (one direction, no cycle). Each file has one responsibility and stays small enough to hold in context.

---

## Task 1: Scaffold the package

**Files:**
- Create: `packages/adapter-postgres/package.json`
- Create: `packages/adapter-postgres/tsconfig.json`
- Create: `packages/adapter-postgres/tsup.config.ts`
- Create: `packages/adapter-postgres/vitest.config.ts`
- Create: `packages/adapter-postgres/src/index.ts` (temporary stub)
- Create: `packages/adapter-postgres/LICENSE` (copy of root `LICENSE`)
- Modify: `tsconfig.json` (root) — add reference
- Modify: `.changeset/config.json` — add to `fixed` group

- [ ] **Step 1: Write `package.json`**

```json
{
  "name": "@airnauts/comments-adapter-postgres",
  "version": "0.5.0",
  "description": "PostgreSQL repository adapter for the Airnauts commenting tool server.",
  "keywords": [
    "comments",
    "commenting",
    "annotations",
    "feedback",
    "airnauts",
    "postgres",
    "postgresql",
    "adapter"
  ],
  "license": "MIT",
  "author": "Airnauts",
  "homepage": "https://github.com/Airnauts/commenting-tool#readme",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/Airnauts/commenting-tool.git",
    "directory": "packages/adapter-postgres"
  },
  "bugs": {
    "url": "https://github.com/Airnauts/commenting-tool/issues"
  },
  "type": "module",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "files": [
    "dist",
    "!dist/.tsbuildinfo",
    "README.md",
    "LICENSE"
  ],
  "publishConfig": {
    "access": "public"
  },
  "scripts": {
    "build": "tsup && tsc --build --force",
    "typecheck": "tsc --build",
    "test": "vitest run"
  },
  "dependencies": {
    "@airnauts/comments-core": "workspace:^",
    "@airnauts/comments-server": "workspace:^"
  },
  "peerDependencies": {
    "pg": "^8.11.0"
  },
  "peerDependenciesMeta": {
    "pg": {
      "optional": true
    }
  },
  "devDependencies": {
    "@airnauts/comments-test-support": "workspace:*",
    "@electric-sql/pglite": "^0.5.1",
    "@types/pg": "^8.11.0",
    "pg": "^8.11.0"
  }
}
```

Note: `0.5.0` matches the current `fixed`-group version (adapter-mongo is `0.5.0`); the changeset in Task 6 bumps every fixed package together. `pg` is an **optional peer** (only the lazy convenience uses it) but a **devDependency** so the dynamic `import('pg')` typechecks.

- [ ] **Step 2: Write `tsconfig.json`** (identical to `adapter-mongo`'s)

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

- [ ] **Step 3: Write `tsup.config.ts`** (identical to `adapter-mongo`'s)

```ts
import { defineConfig } from 'tsup'

export default defineConfig({
  entry: { index: 'src/index.ts' },
  format: ['esm'],
  dts: false,
  sourcemap: true,
  outDir: 'dist',
  // Remove stale .js/.d.ts before the build. NOTE: tsup's clean does NOT
  // delete the dotfile dist/.tsbuildinfo, so declaration re-emit is forced by
  // `tsc --build --force` in package.json, not by this clean (ADR-0023).
  clean: true,
})
```

- [ ] **Step 4: Write `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    name: 'adapter-postgres',
    environment: 'node',
  },
})
```

- [ ] **Step 5: Write a temporary `src/index.ts` stub** (replaced in later tasks; lets the package build empty)

```ts
export const VERSION = '0.0.0'
```

- [ ] **Step 6: Copy the LICENSE file**

Run: `cp packages/adapter-mongo/LICENSE packages/adapter-postgres/LICENSE`

- [ ] **Step 7: Add the root tsconfig project reference**

In `tsconfig.json` (root), add to the `references` array, after the `adapter-mongo` entry:

```json
    { "path": "packages/adapter-postgres" },
```

- [ ] **Step 8: Add the package to the changeset `fixed` group**

In `.changeset/config.json`, add `"@airnauts/comments-adapter-postgres"` to the single `fixed` array (keep it alphabetical — between `adapter-mongo` and `client`):

```json
      "@airnauts/comments-adapter-mongo",
      "@airnauts/comments-adapter-postgres",
      "@airnauts/comments-client",
```

- [ ] **Step 9: Install and verify the empty package builds**

Run: `pnpm install`
Expected: completes; resolves `@electric-sql/pglite`, `pg`, `@types/pg`. If pnpm warns that `@electric-sql/pglite` has an ignored build script, add it to `pnpm-approved-builds.json` and `onlyBuiltDependencies` in `pnpm-workspace.yaml`, then re-run `pnpm install`.

Run: `pnpm --filter @airnauts/comments-adapter-postgres build`
Expected: PASS — emits `dist/index.js` and `dist/index.d.ts`.

- [ ] **Step 10: Commit**

```bash
git add packages/adapter-postgres tsconfig.json .changeset/config.json pnpm-lock.yaml pnpm-workspace.yaml pnpm-approved-builds.json
git commit -m "chore(adapter-postgres): scaffold package"
```

---

## Task 2: Schema (`ensureSchema` + DDL) — test-first

**Files:**
- Create: `packages/adapter-postgres/src/schema.ts`
- Test: `packages/adapter-postgres/src/schema.test.ts`

- [ ] **Step 1: Write the failing test**

`packages/adapter-postgres/src/schema.test.ts`:

```ts
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { ensureSchema } from './schema'

let db: PGlite

beforeAll(async () => {
  db = new PGlite()
  await ensureSchema(db)
})

afterAll(async () => {
  await db?.close()
})

it('creates the threads and attachments tables', async () => {
  const { rows } = await db.query<{ table_name: string }>(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name IN ('comments_threads', 'comments_attachments')
     ORDER BY table_name`,
  )
  expect(rows.map((r) => r.table_name)).toEqual(['comments_attachments', 'comments_threads'])
})

it('creates the list index used for keyset pagination', async () => {
  const { rows } = await db.query<{ indexname: string }>(
    `SELECT indexname FROM pg_indexes
     WHERE tablename = 'comments_threads' AND indexname = 'comments_threads_list'`,
  )
  expect(rows).toHaveLength(1)
})

it('is idempotent — running twice does not throw', async () => {
  await ensureSchema(db)
  await ensureSchema(db)
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @airnauts/comments-adapter-postgres test schema`
Expected: FAIL — `Cannot find module './schema'` (or `ensureSchema is not exported`).

- [ ] **Step 3: Write `src/schema.ts`**

```ts
/**
 * Minimal connection seam — the shape that `pg.Pool`, PGlite, and Neon's `Pool`
 * all satisfy. The adapter never owns the connection; the host supplies one.
 * (Neon's pure-HTTP tagged-template form does NOT satisfy this — use Neon's Pool.)
 */
export interface SqlExecutor {
  query(text: string, params?: unknown[]): Promise<{ rows: any[] }>
}

export const THREADS_TABLE = 'comments_threads'
export const ATTACHMENTS_TABLE = 'comments_attachments'

// Idempotent DDL (CREATE … IF NOT EXISTS). `updated_at` is text holding the exact
// ISO string so keyset comparison stays byte-for-byte consistent with the cursor;
// `env` is NOT NULL DEFAULT '' so absent env is plain equality, never SQL NULL.
const DDL: string[] = [
  `CREATE TABLE IF NOT EXISTS comments_threads (
     id          text PRIMARY KEY,
     project_id  text NOT NULL,
     env         text NOT NULL DEFAULT '',
     page_key    text,
     status      text NOT NULL,
     updated_at  text NOT NULL,
     doc         jsonb NOT NULL
   )`,
  `CREATE INDEX IF NOT EXISTS comments_threads_list
     ON comments_threads (project_id, env, updated_at DESC, id DESC)`,
  `CREATE TABLE IF NOT EXISTS comments_attachments (
     id          text PRIMARY KEY,
     project_id  text NOT NULL,
     env         text NOT NULL DEFAULT '',
     doc         jsonb NOT NULL
   )`,
]

/** Create the tables + index. Idempotent: safe to run on every startup. */
export async function ensureSchema(sql: SqlExecutor): Promise<void> {
  for (const stmt of DDL) {
    await sql.query(stmt)
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @airnauts/comments-adapter-postgres test schema`
Expected: PASS — all three tests green.

- [ ] **Step 5: Commit**

```bash
git add packages/adapter-postgres/src/schema.ts packages/adapter-postgres/src/schema.test.ts
git commit -m "feat(adapter-postgres): idempotent ensureSchema + DDL"
```

---

## Task 3: Wire the Repository contract — red

**Files:**
- Create: `packages/adapter-postgres/src/repository.ts` (stub methods)
- Create: `packages/adapter-postgres/src/repository.test.ts`
- Modify: `packages/adapter-postgres/src/index.ts`

- [ ] **Step 1: Write the contract test harness**

`packages/adapter-postgres/src/repository.test.ts`:

```ts
import { repositoryContract } from '@airnauts/comments-test-support'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll } from 'vitest'
import { createPostgresRepository, ensureSchema } from './index'
import type { SqlExecutor } from './schema'

let db: PGlite

beforeAll(async () => {
  db = new PGlite()
  await ensureSchema(db)
})

afterAll(async () => {
  await db?.close()
})

// The contract suite calls makeRepo in beforeEach and registers no afterEach,
// so isolation lives here: truncate the shared tables before each test.
repositoryContract('postgres', async () => {
  await db.query('TRUNCATE comments_threads, comments_attachments')
  return createPostgresRepository({ sql: db as unknown as SqlExecutor })
})
```

(The `as unknown as SqlExecutor` cast is because PGlite's `query` result type is wider than `{ rows: any[] }`; it satisfies the interface structurally.)

- [ ] **Step 2: Write `src/repository.ts` with stub methods**

```ts
import type {
  Attachment,
  AttachmentId,
  Comment,
  Thread,
  ThreadId,
  ThreadListItem,
  ThreadStatus,
} from '@airnauts/comments-core'
import type {
  AnchorPatch,
  ListQuery,
  ListResult,
  NewComment,
  NewThread,
  Repository,
  Scope,
} from '@airnauts/comments-server'
import type { SqlExecutor } from './schema'

export function createPostgresRepository(_opts: { sql: SqlExecutor }): Repository {
  const notImplemented = (): never => {
    throw new Error('not implemented')
  }
  return {
    createThread: notImplemented as () => Promise<Thread>,
    getThread: notImplemented as () => Promise<Thread | null>,
    listThreads: notImplemented as () => Promise<ListResult>,
    addComment: notImplemented as () => Promise<Comment>,
    setStatus: notImplemented as () => Promise<Thread>,
    updateAnchor: notImplemented as () => Promise<ThreadListItem>,
    putAttachment: notImplemented as () => Promise<void>,
    getAttachments: notImplemented as () => Promise<Attachment[]>,
  }
}
```

(Unused type imports `AttachmentId`, `ThreadId`, `ThreadStatus`, `AnchorPatch`, `NewComment`, `NewThread` are added now because Task 4 uses them; if the linter rejects unused imports at this step, proceed straight to Task 4 — this stub is transient and not committed.)

- [ ] **Step 3: Replace `src/index.ts` with the real exports**

```ts
export { createPostgresRepository, postgresRepository } from './repository'
export { ensureSchema, type SqlExecutor } from './schema'
```

(`postgresRepository` doesn't exist yet — Step 4 below makes this red compile-fail expected.)

- [ ] **Step 4: Run the contract suite to verify it fails**

Run: `pnpm --filter @airnauts/comments-adapter-postgres test repository`
Expected: FAIL — either a typecheck error on the missing `postgresRepository` export, or (once that's stubbed) every contract assertion throwing `not implemented`. This confirms the harness is wired to the real contract. Do not commit red.

---

## Task 4: Implement the Repository — green

**Files:**
- Modify: `packages/adapter-postgres/src/repository.ts` (full implementation)

- [ ] **Step 1: Replace `src/repository.ts` with the full implementation**

```ts
import type {
  Attachment,
  AttachmentId,
  Comment,
  Thread,
  ThreadId,
  ThreadListItem,
  ThreadStatus,
} from '@airnauts/comments-core'
import {
  type AnchorPatch,
  decodeCursor,
  encodeCursor,
  type ListQuery,
  type ListResult,
  lazyRepository,
  type NewComment,
  type NewThread,
  type Repository,
  type Scope,
} from '@airnauts/comments-server'
import { ensureSchema, type SqlExecutor } from './schema'

/** Absent env is stored/queried as '' (never SQL NULL) so equality stays simple. */
function scopeEnv(scope: Scope): string {
  return scope.env ?? ''
}

function unresolvedCountOf(status: ThreadStatus): number {
  return status === 'open' ? 1 : 0
}

/** The Thread without the heavy fields the list projection drops. */
type ThreadBaseRow = Omit<Thread, 'comments' | 'captureContext' | 'provenance'>

function toListItem(base: ThreadBaseRow, root: Comment | null | undefined): ThreadListItem {
  return {
    ...base,
    rootComment: root ? { text: root.text, createdAt: root.createdAt } : null,
  }
}

export function createPostgresRepository({ sql }: { sql: SqlExecutor }): Repository {
  return {
    async createThread(input: NewThread): Promise<Thread> {
      // doc is the full wire Thread (incl. id). project_id/env are server-only scope columns.
      const thread: Thread = {
        id: input.id,
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
      await sql.query(
        `INSERT INTO comments_threads (id, project_id, env, page_key, status, updated_at, doc)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
        [
          input.id,
          input.projectId,
          scopeEnv(input),
          input.pageKey,
          input.status,
          input.updatedAt,
          JSON.stringify(thread),
        ],
      )
      return thread
    },

    async getThread(scope: Scope, id: ThreadId): Promise<Thread | null> {
      const { rows } = await sql.query(
        `SELECT doc FROM comments_threads WHERE id = $1 AND project_id = $2 AND env = $3`,
        [id, scope.projectId, scopeEnv(scope)],
      )
      return rows[0] ? (rows[0].doc as Thread) : null
    },

    async listThreads(query: ListQuery): Promise<ListResult> {
      const limit = Math.max(1, Math.min(query.limit, 200))
      const where: string[] = ['project_id = $1', 'env = $2']
      const params: unknown[] = [query.projectId, scopeEnv(query)]
      if (query.pageKey !== undefined) {
        params.push(query.pageKey)
        where.push(`page_key = $${params.length}`)
      }
      if (query.status !== undefined) {
        params.push(query.status)
        where.push(`status = $${params.length}`)
      }
      const cursor = query.cursor ? decodeCursor(query.cursor) : undefined
      if (cursor) {
        params.push(cursor.updatedAt, cursor.id)
        where.push(`(updated_at, id) < ($${params.length - 1}, $${params.length})`)
      }
      params.push(limit + 1)
      const { rows } = await sql.query(
        `SELECT id,
                doc - 'comments' - 'captureContext' - 'provenance' AS base,
                doc->'comments'->0 AS root
         FROM comments_threads
         WHERE ${where.join(' AND ')}
         ORDER BY updated_at DESC, id DESC
         LIMIT $${params.length}`,
        params,
      )
      const more = rows.length > limit
      const page = more ? rows.slice(0, limit) : rows
      const threads = page.map((r) => toListItem(r.base as ThreadBaseRow, r.root as Comment | null))
      const last = page[page.length - 1]
      const nextCursor =
        more && last
          ? encodeCursor({ updatedAt: (last.base as ThreadBaseRow).updatedAt, id: last.id })
          : null
      return { threads, nextCursor }
    },

    async addComment(scope: Scope, threadId: ThreadId, comment: NewComment): Promise<Comment> {
      // unresolvedCount is intentionally untouched: it tracks `status` only, and
      // addComment never changes status. Single statement => atomic without a txn.
      const { rows } = await sql.query(
        `UPDATE comments_threads
         SET doc = jsonb_set(
                     jsonb_set(
                       jsonb_set(
                         jsonb_set(doc, '{comments}', (doc->'comments') || $4::jsonb),
                         '{commentCount}', to_jsonb(COALESCE((doc->>'commentCount')::int, 0) + 1)
                       ),
                       '{updatedAt}', to_jsonb($5::text)
                     ),
                     '{lastActivityAt}', to_jsonb($5::text)
                   ),
             updated_at = $5
         WHERE id = $1 AND project_id = $2 AND env = $3
         RETURNING id`,
        [threadId, scope.projectId, scopeEnv(scope), JSON.stringify(comment), comment.createdAt],
      )
      if (rows.length === 0) throw new Error('thread not found')
      return comment
    },

    async setStatus(
      scope: Scope,
      threadId: ThreadId,
      status: ThreadStatus,
      now: string,
    ): Promise<Thread> {
      const { rows } = await sql.query(
        `UPDATE comments_threads
         SET status = $4,
             updated_at = $5,
             doc = jsonb_set(
                     jsonb_set(
                       jsonb_set(
                         jsonb_set(doc, '{status}', to_jsonb($4::text)),
                         '{updatedAt}', to_jsonb($5::text)
                       ),
                       '{lastActivityAt}', to_jsonb($5::text)
                     ),
                     '{unresolvedCount}', to_jsonb($6::int)
                   )
         WHERE id = $1 AND project_id = $2 AND env = $3
         RETURNING doc`,
        [threadId, scope.projectId, scopeEnv(scope), status, now, unresolvedCountOf(status)],
      )
      if (rows.length === 0) throw new Error('thread not found')
      return rows[0].doc as Thread
    },

    async updateAnchor(
      scope: Scope,
      threadId: ThreadId,
      patch: AnchorPatch,
      now: string,
    ): Promise<ThreadListItem> {
      // Always set anchorState + timestamps; conditionally set the patched anchor fields.
      const sets: string[] = [
        `'{anchorState}', to_jsonb($4::text)`,
        `'{updatedAt}', to_jsonb($5::text)`,
        `'{lastActivityAt}', to_jsonb($5::text)`,
      ]
      const params: unknown[] = [
        threadId,
        scope.projectId,
        scopeEnv(scope),
        patch.anchorState,
        now,
      ]
      if (patch.selectors !== undefined) {
        params.push(JSON.stringify(patch.selectors))
        sets.push(`'{anchor,selectors}', $${params.length}::jsonb`)
      }
      if (patch.signals !== undefined) {
        params.push(JSON.stringify(patch.signals))
        sets.push(`'{anchor,signals}', $${params.length}::jsonb`)
      }
      if (patch.selectionLost !== undefined) {
        params.push(patch.selectionLost)
        sets.push(`'{selectionLost}', to_jsonb($${params.length}::boolean)`)
      }
      let docExpr = 'doc'
      for (const s of sets) docExpr = `jsonb_set(${docExpr}, ${s})`
      const { rows } = await sql.query(
        `UPDATE comments_threads
         SET doc = ${docExpr}, updated_at = $5
         WHERE id = $1 AND project_id = $2 AND env = $3
         RETURNING doc - 'comments' - 'captureContext' - 'provenance' AS base,
                   doc->'comments'->0 AS root`,
        params,
      )
      if (rows.length === 0) throw new Error('thread not found')
      return toListItem(rows[0].base as ThreadBaseRow, rows[0].root as Comment | null)
    },

    async putAttachment(scope: Scope, attachment: Attachment): Promise<void> {
      await sql.query(
        `INSERT INTO comments_attachments (id, project_id, env, doc)
         VALUES ($1, $2, $3, $4::jsonb)
         ON CONFLICT (id) DO UPDATE SET project_id = EXCLUDED.project_id,
                                        env = EXCLUDED.env,
                                        doc = EXCLUDED.doc`,
        [attachment.id, scope.projectId, scopeEnv(scope), JSON.stringify(attachment)],
      )
    },

    async getAttachments(scope: Scope, ids: AttachmentId[]): Promise<Attachment[]> {
      if (ids.length === 0) return []
      // Build an IN-list (portable across pg/PGlite — avoids array-param binding quirks).
      const placeholders = ids.map((_, i) => `$${i + 1}`).join(', ')
      const params: unknown[] = [...ids, scope.projectId, scopeEnv(scope)]
      const { rows } = await sql.query(
        `SELECT doc FROM comments_attachments
         WHERE id IN (${placeholders})
           AND project_id = $${ids.length + 1}
           AND env = $${ids.length + 2}`,
        params,
      )
      return rows.map((r) => r.doc as Attachment)
    },
  }
}

/** Open a `pg` Pool, ensure the schema, and build the repository. */
async function connectPostgres(connectionString: string): Promise<Repository> {
  const pg = (await import('pg')).default
  const pool = new pg.Pool({ connectionString })
  await ensureSchema(pool)
  return createPostgresRepository({ sql: pool })
}

/**
 * Host-facing Postgres `Repository`: lazily opens a `pg` Pool on first use and
 * memoizes it under `cacheKey` (warm serverless / HMR reuse). The single function
 * a host imports when it wants the adapter to own the connection;
 * `createPostgresRepository` remains for callers that supply their own executor
 * (Neon Pool, Supabase/PgBouncer pool, an existing pg.Pool).
 *
 * `cacheKey` defaults to `'postgres'`. Pass a distinct key per database if you
 * connect to more than one in the same process.
 */
export function postgresRepository({
  connectionString,
  cacheKey = 'postgres',
}: {
  connectionString: string
  cacheKey?: string
}): Repository {
  return lazyRepository(() => connectPostgres(connectionString), { cacheKey })
}
```

- [ ] **Step 2: Run the contract suite to verify it passes**

Run: `pnpm --filter @airnauts/comments-adapter-postgres test`
Expected: PASS — the full `Repository contract — postgres` suite plus the schema tests are green.

If `rows[0].doc` is a string rather than a parsed object (some drivers don't auto-parse jsonb), wrap reads in a helper `const asJson = (v: unknown) => typeof v === 'string' ? JSON.parse(v) : v` and apply it at each `r.doc`/`r.base`/`r.root` read site. PGlite and `pg` both auto-parse jsonb, so this should not be needed — only add it if a test fails on a string value.

- [ ] **Step 3: Typecheck and lint**

Run: `pnpm --filter @airnauts/comments-adapter-postgres typecheck`
Expected: PASS.

Run: `pnpm lint` (biome ci — the strict gate)
Expected: PASS. If biome flags formatting, run `pnpm format` (or `biome check --write`) and re-run.

- [ ] **Step 4: Commit**

```bash
git add packages/adapter-postgres/src/repository.ts packages/adapter-postgres/src/repository.test.ts packages/adapter-postgres/src/index.ts
git commit -m "feat(adapter-postgres): implement Repository against the shared contract"
```

---

## Task 5: README

**Files:**
- Create: `packages/adapter-postgres/README.md`

- [ ] **Step 1: Write `README.md`** (adapts `adapter-mongo`'s, documenting both entry points + the executor seam)

````markdown
# @airnauts/comments-adapter-postgres

PostgreSQL repository adapter for the [Airnauts commenting tool](https://github.com/Airnauts/commenting-tool) server.

## Install

```bash
pnpm add @airnauts/comments-adapter-postgres pg
```

`pg` is an optional peer — needed only for the lazy `postgresRepository`
convenience. If you supply your own executor (Neon, Supabase, an existing pool),
you don't need it.

## Usage

### Let the adapter own the connection

```ts
import { postgresRepository } from '@airnauts/comments-adapter-postgres'

const repository = postgresRepository({
  connectionString: process.env.DATABASE_URL!,
})
```

It connects lazily on first use, memoizes the pool across hot reloads/warm
invocations via `cacheKey`, and runs `ensureSchema` for you.

### Bring your own executor (serverless / Neon / Supabase)

`createPostgresRepository` accepts anything with a node-postgres-style
`query(text, params)` method — `pg.Pool`, Neon's `Pool`, etc. This keeps the
adapter free of any driver dependency.

```ts
import { Pool } from '@neondatabase/serverless'
import { createPostgresRepository, ensureSchema } from '@airnauts/comments-adapter-postgres'

const pool = new Pool({ connectionString: process.env.DATABASE_URL! })
await ensureSchema(pool)
const repository = createPostgresRepository({ sql: pool })
```

> Note: Neon's pure-HTTP tagged-template client does not satisfy the
> `query(text, params)` shape — use Neon's `Pool`.

## Schema

`ensureSchema(sql)` creates two tables (`comments_threads`,
`comments_attachments`) and one index with `CREATE … IF NOT EXISTS`, so it's safe
to call on every startup. Production teams that prefer managed migrations can run
the equivalent DDL through their own tool instead.
````

- [ ] **Step 2: Commit**

```bash
git add packages/adapter-postgres/README.md
git commit -m "docs(adapter-postgres): README with both entry points"
```

---

## Task 6: ADR, architecture note, and changeset

**Files:**
- Modify: `docs/adr.md` (append ADR-0035)
- Modify: `docs/architecture.md` (§2 adapter list + §1 decisions table)
- Create: `.changeset/postgres-adapter.md`

- [ ] **Step 1: Append ADR-0035 to `docs/adr.md`**

Add at the end of the file (newest-last):

```markdown
## ADR-0035: PostgreSQL repository adapter

- **Date:** 2026-06-08
- **Status:** Accepted. Amends ADR-0003 (which scoped v1 to a single MongoDB
  repository concrete and listed "other DBs" as a designed-but-unbuilt seam).

### Context

Adopters who run PostgreSQL rather than MongoDB had no persistence path. The
`Repository` seam and its shared conformance suite (`repositoryContract`) were
built to make a second concrete cheap; the open question was how to add Postgres
without (a) coupling to a specific driver and (b) breaking on serverless hosts,
where raw Postgres connections exhaust unlike the pooled mongo driver.

### Decision

Add `@airnauts/comments-adapter-postgres` as a second `Repository` concrete:

- **Driver-agnostic executor seam.** `createPostgresRepository({ sql })` accepts
  any `{ query(text, params): Promise<{ rows }> }` (pg.Pool, Neon Pool, PGlite),
  mirroring how `createMongoRepository({ db })` takes a connected `Db`. The host
  owns pooling, so the same adapter works on long-lived and serverless hosts. A
  `postgresRepository({ connectionString })` convenience covers the simple case
  via an optional `pg` peer dependency.
- **Hybrid storage.** One `comments_threads` table with scalar columns for the
  filtered/sorted fields plus a `doc jsonb` holding the full wire Thread; a
  `comments_attachments` table alongside. `updated_at` is stored as text (exact
  ISO string) so keyset pagination stays byte-for-byte consistent with the
  cursor; `env` is `NOT NULL DEFAULT ''`.
- **Idempotent `ensureSchema`**, mirroring mongo's `ensureIndexes`.
- **Hermetic tests** via PGlite (in-process WASM Postgres) running the shared
  contract suite; documented to gate SQL correctness, not concurrency (every
  write is single-statement atomic by construction).

### Consequences

- Postgres becomes a drop-in alternative to Mongo behind the unchanged seam.
- The executor seam pushes connection lifecycle to the host — the price of
  serverless portability.
- MySQL and Redis remain unbuilt seams; a shared SQL core is deliberately NOT
  abstracted until a second SQL adapter exists (rule of three).
```

- [ ] **Step 2: Note the concrete in `docs/architecture.md` §2**

In the monorepo package list in §2, add a bullet after the
`@airnauts/comments-adapter-mongo` entry:

```markdown
- **`@airnauts/comments-adapter-postgres`** — PostgreSQL repository (hybrid columns +
  `jsonb`); driver-agnostic via a host-supplied `query()` executor, with a `pg`-based
  lazy convenience.
```

And in the §1 "Decisions at a glance" table, update the ADR-0003 row's decision
text to note the added concrete, appending: ` PostgreSQL added in ADR-0035.`

- [ ] **Step 3: Create the changeset**

`.changeset/postgres-adapter.md`:

```markdown
---
'@airnauts/comments-adapter-postgres': minor
---

Add `@airnauts/comments-adapter-postgres`: a PostgreSQL repository adapter that's a drop-in alternative to the MongoDB adapter. Driver-agnostic — pass any `pg`/Neon/PGlite executor to `createPostgresRepository`, or use the lazy `postgresRepository({ connectionString })` convenience.
```

Note: every package in the `fixed` group version-bumps together, but only the
new package needs a user-facing summary, so list just it here.

- [ ] **Step 4: Verify the changeset is well-formed**

Run: `pnpm changeset status`
Expected: lists `@airnauts/comments-adapter-postgres` (and the fixed-group siblings) for a bump, no errors.

- [ ] **Step 5: Commit**

```bash
git add docs/adr.md docs/architecture.md .changeset/postgres-adapter.md
git commit -m "docs(adapter-postgres): ADR-0035, architecture note, changeset"
```

---

## Task 7: Full verification

- [ ] **Step 1: Build the whole workspace** (catches cross-package `tsc --build` races / declaration issues)

Run: `pnpm build`
Expected: PASS for all packages including `adapter-postgres`.

- [ ] **Step 2: Run the full test + lint gate**

Run: `pnpm test`
Expected: PASS, including `adapter-postgres` schema + contract suites.

Run: `pnpm lint`
Expected: PASS (biome ci).

- [ ] **Step 3: Final commit if anything changed** (e.g. formatting)

```bash
git add -A
git commit -m "chore(adapter-postgres): final verification fixups" || echo "nothing to commit"
```

---

## Self-Review notes (for the implementer)

- **Spec coverage:** §2 API → Tasks 1/3/4; §3 connection model → Task 4 (`postgresRepository`/executor); §4 schema/columns → Task 2; §4.2 list projection → `listThreads`/`updateAnchor` (`doc - 'comments' …`); §5 methods → Task 4; §5.2 single-statement `addComment` → Task 4; §6 PGlite tests → Tasks 2/3; §7 ADR/changeset/architecture → Task 6. No gaps.
- **No driver lock-in:** only `repository.ts`'s `connectPostgres` references `pg`, via dynamic import; the core factory and `schema.ts` are driver-free.
- **rowCount portability:** every mutation detects "not found" via `RETURNING … ` + `rows.length === 0`, never a driver-specific `rowCount`.
- **Type consistency:** `SqlExecutor` defined once in `schema.ts`, imported everywhere; `ThreadBaseRow`, `toListItem`, `scopeEnv`, `unresolvedCountOf` names are stable across `listThreads`/`updateAnchor`.
```
