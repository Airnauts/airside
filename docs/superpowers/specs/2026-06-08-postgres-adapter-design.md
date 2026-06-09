# Postgres Repository Adapter — Design

- **Status:** Approved (brainstorm complete)
- **Date:** 2026-06-08
- **Package:** `@airnauts/comments-adapter-postgres` (new)
- **Inputs:** [`docs/architecture.md`](../../architecture.md) §2 ·
  [`docs/adr.md`](../../adr.md) (ADR-0003 adapter scope, ADR-0021/0022 uniform
  construction) · existing `packages/adapter-mongo` as the shape to mirror
- **Scope:** one production-grade Postgres `Repository` adapter, end-to-end.
  MySQL and Redis are explicitly **out of scope** — each is its own later spec.

---

## 1. Goal & context

The system already defines a single `Repository` seam
(`packages/server/src/repository/types.ts`) with one concrete: MongoDB. Adopters
who run Postgres rather than Mongo have no path today. This adds Postgres as a
second concrete that passes the same shared conformance suite
(`repositoryContract`), so it is a drop-in for the mongo adapter behind the
identical interface.

The defining difference from Mongo is the **serverless connection story**: the
mongo driver pools cleanly across warm invocations, raw Postgres connections do
not. The design resolves this by never owning the connection — the adapter
consumes a caller-supplied executor (§3).

## 2. Public API

New pnpm workspace `packages/adapter-postgres`, mirroring `adapter-mongo`'s
exports (factory + lazy convenience + schema helper):

```ts
// The driver seam — the minimal shape that pg.Pool, PGlite, and Neon's Pool
// all satisfy. Defining this interface is what makes the adapter driver-agnostic.
export interface SqlExecutor {
  query(text: string, params?: unknown[]): Promise<{ rows: any[] }>
}

// Pure adapter — pulls NO driver. The host passes any executor.
export function createPostgresRepository(opts: { sql: SqlExecutor }): Repository

// Convenience — lazy-connects via `pg`, memoized through the existing
// server `lazyRepository` (one connected Repository per cacheKey).
export function postgresRepository(opts: {
  connectionString: string
  cacheKey?: string
}): Repository

// Idempotent DDL (CREATE TABLE/INDEX IF NOT EXISTS). Mirrors mongo's ensureIndexes.
export async function ensureSchema(sql: SqlExecutor): Promise<void>
```

`pg` is an **optional peer dependency**, dynamically imported only by the
`postgresRepository` convenience. A host that wires its own executor — Neon's
`Pool`, a Supabase/PgBouncer pool — never pulls `pg`. This realizes the
architecture's "only the package you import pulls its driver" principle.

**Docs note:** Neon's pure-HTTP tagged-template form does *not* satisfy
`.query(text, params)`; Neon hosts must use Neon's `Pool`.

## 3. Connection model (the serverless seam)

`createMongoRepository({ db })` takes an already-connected `Db`; this adapter
takes an already-connected `SqlExecutor` by exact analogy. The host owns
pooling, so the same adapter works against:

- `pg` + an external pooler (PgBouncer / Supabase pooler) on a long-lived host,
- Neon's serverless `Pool` on Vercel,
- PGlite in tests (§6).

The `postgresRepository({ connectionString })` convenience covers the simple
long-lived case: it builds a `pg.Pool` lazily on first query and memoizes the
connected `Repository` under `cacheKey` via the existing `lazyRepository`
(default `cacheKey` derived from the connection string).

## 4. Data model — hybrid (columns + jsonb doc)

Two scoped tables. `doc jsonb` is the source of truth (near-1:1 with mongo's
stored thread); the scalar columns are a **derived index over `doc`**, written
on every mutation, that exist only to make the contract's filters and sort cheap.

```sql
CREATE TABLE IF NOT EXISTS comments_threads (
  id          text PRIMARY KEY,
  project_id  text NOT NULL,
  env         text NOT NULL DEFAULT '',   -- absent env normalized to '' (never NULL)
  page_key    text,
  status      text NOT NULL,
  updated_at  text NOT NULL,              -- exact ISO string (see §4.1)
  doc         jsonb NOT NULL
);
CREATE INDEX IF NOT EXISTS comments_threads_list
  ON comments_threads (project_id, env, updated_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS comments_attachments (
  id          text PRIMARY KEY,
  project_id  text NOT NULL,
  env         text NOT NULL DEFAULT '',
  doc         jsonb NOT NULL
);
```

### 4.1 Two non-obvious column decisions

- **`updated_at` is `text`, not `timestamptz`.** The list cursor encodes the ISO
  string (`encodeCursor` in `packages/server/src/cursor.ts`) and mongo compares
  strings. Storing the exact ISO string keeps the keyset comparison
  `(updated_at, id) < (cursor.u, cursor.i)` byte-for-byte consistent with the
  cursor, avoiding precision/format drift a `timestamptz` round-trip could
  introduce.
- **`env NOT NULL DEFAULT ''`.** Absent env is normalized to `''` so
  `WHERE env = $1` is plain equality and never silently misses on a SQL `NULL`.
  (`doc` still carries env faithfully, including absent.)

### 4.2 List projection

`listThreads` returns `ThreadListItem`, which omits the full `comments` array,
`captureContext`, and `provenance` (mongo does `comments:$slice 1` + projects
them out). The Postgres `SELECT` extracts only the needed jsonb paths
(`commentCount`, `unresolvedCount`, first comment, anchor/status fields) rather
than loading the whole `doc`, keeping list queries cheap.

## 5. Method behavior (mirrors mongo exactly)

| Method | Implementation | Notes |
|---|---|---|
| `createThread` | `INSERT` row + `doc` | returns full Thread |
| `getThread` | `SELECT doc WHERE id + scope` | `null` if absent |
| `listThreads` | keyset query (below) | reuse server `encode/decodeCursor` |
| `addComment` | single-statement `jsonb_set` UPDATE | see §5.2; **no `unresolvedCount` change** |
| `setStatus` | `UPDATE` status/updated_at cols + `doc` fields `RETURNING doc` | `unresolvedCount = open?1:0` |
| `updateAnchor` | `UPDATE` doc anchor fields | returns `ThreadListItem` |
| `putAttachment` | upsert into `comments_attachments` | keyed by id + scope |
| `getAttachments` | `WHERE id = ANY($ids) AND scope` | missing/foreign ids omitted; order not guaranteed |

A mutation that matches no row (`rowCount === 0`) throws `"thread not found"`,
matching mongo.

### 5.1 listThreads query

```sql
SELECT <projected jsonb paths>
FROM comments_threads
WHERE project_id = $1 AND env = $2
  [AND page_key = $3] [AND status = $4]
  [AND (updated_at, id) < ($cu, $ci)]      -- keyset, only when a cursor is given
ORDER BY updated_at DESC, id DESC
LIMIT $n + 1;                               -- +1 row detects `nextCursor`
```

`limit` clamped to `[1, 200]` (mongo's bound). `nextCursor` is
`encodeCursor({ updatedAt, id })` of the last in-page row when a surplus row
exists, else `null`.

### 5.2 addComment is a single statement by design

`UPDATE` appends to `doc->'comments'`, bumps `doc->'commentCount'`, and sets
`doc` `updatedAt`/`lastActivityAt` plus the `updated_at` column — all in one
`jsonb_set`-composed statement, atomic without an explicit transaction. This is
chosen deliberately: PGlite (§6) is single-connection and cannot test
concurrency, so the write is constructed to need no concurrency testing.
`unresolvedCount` is intentionally untouched (it tracks `status` only; mongo has
an explicit comment forbidding an `$inc` here).

## 6. Testing

`packages/adapter-postgres/src/repository.test.ts` runs the shared
`repositoryContract('postgres', makeRepo)` against **PGlite**
(`@electric-sql/pglite`) — real Postgres compiled to WASM, in-process, no Docker,
hermetic, matching the project's e2e ethos. `makeRepo` provisions a fresh PGlite
DB (or `TRUNCATE`s the tables) and runs `ensureSchema` per test for isolation;
PGlite's `.query()` satisfies `SqlExecutor` directly.

**Documented limitation:** PGlite is single-connection, so this gates **SQL
correctness, not real concurrency**. That is acceptable because every write is
single-statement atomic by construction (§5.2). The mongo integration suite
remains the broader document-model fidelity backstop.

## 7. Conventions & follow-on

- **ADR-0035** (2026-06-08), "Postgres repository adapter": records choosing a
  new database (CLAUDE.md mandates an ADR for a database choice) and **amends
  ADR-0003**, which currently states v1 has no other DB concretes. Added to
  `docs/adr.md` as an explicit step in the implementation plan (the ADR is not
  the design doc).
- **Changeset:** `minor` bump for the new publishable package; added to the
  `fixed` version group so it tracks the other `@airnauts/comments-*` versions.
- **Architecture:** note the new concrete in `docs/architecture.md` §2's adapter
  list and the §1 decisions table (ADR-0003 row).
- **Deferred (measure-first):** a second composite index
  `(project_id, env, page_key, updated_at DESC, id DESC)` for `page_key`/`status`
  filters. Ship the single list index; add more only if profiling shows need.

## 8. Out of scope

- MySQL and Redis adapters (separate specs; do not pre-abstract a shared SQL
  core until a second SQL adapter actually exists).
- Any change to `core`, `server` business logic, the client, or the contract
  suite itself — this adapter conforms to the existing seam unchanged.
