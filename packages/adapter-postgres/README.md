# @airnauts/comments-adapter-postgres

PostgreSQL repository adapter for the [Airnauts commenting tool](https://github.com/Airnauts/commenting-tool) server. Stores threads in a hybrid relational + `jsonb` schema; driver-agnostic via a host-supplied `query()` executor.

## Installation

```bash
pnpm add @airnauts/comments-adapter-postgres
# Add the pg driver only if you use postgresRepository() or a pg.Pool executor:
pnpm add pg
```

`pg` is an optional peer dependency — not needed if you supply your own executor (e.g. Neon's `Pool`, Supabase's client).

## Quick start

```ts
import { postgresRepository } from '@airnauts/comments-adapter-postgres'

const repository = postgresRepository({
  connectionString: process.env.DATABASE_URL!,
})
```

Pass `repository` to `createCommentsServer` from `@airnauts/comments-server` (or to `createCommentsAppRoute` / `createCommentsPagesRoute` from `@airnauts/comments-next`). The adapter connects lazily on first use and runs `ensureSchema` automatically.

## API reference

### `postgresRepository(opts)`

Owns the connection lifecycle. Connects lazily on first use and memoizes the pool under `cacheKey` for hot-reload / warm serverless reuse.

```ts
postgresRepository({
  connectionString: string  // PostgreSQL connection string (required)
  cacheKey?: string         // memoization key, default "postgres"
}): Repository
```

### `createPostgresRepository(opts)`

Lower-level factory for callers that manage their own connection. Accepts anything with a `query(text, params)` method — `pg.Pool`, Neon's `Pool`, Supabase's client, etc.

```ts
import { Pool } from '@neondatabase/serverless'
import { createPostgresRepository, ensureSchema } from '@airnauts/comments-adapter-postgres'

const pool = new Pool({ connectionString: process.env.DATABASE_URL! })
await ensureSchema(pool)
const repository = createPostgresRepository({ sql: pool })
```

> **Note:** Neon's pure-HTTP tagged-template client does not satisfy the `query(text, params)` shape — use Neon's `Pool` instead.

### `ensureSchema(sql)`

Creates the `comments_threads` and `comments_attachments` tables and their indexes with `CREATE … IF NOT EXISTS` — safe to call on every startup. Use this when managing your own executor; `postgresRepository` calls it automatically.

Production teams that prefer managed migrations can run the equivalent DDL through their own tooling instead.

### `SqlExecutor` type

```ts
import type { SqlExecutor } from '@airnauts/comments-adapter-postgres'
// { query(text: string, params?: unknown[]): Promise<{ rows: unknown[] }> }
```

Implement this interface to plug in any Postgres-compatible driver.

## Peer dependencies & requirements

| Peer | Required | Notes |
|---|---|---|
| `pg` | Optional (^8.11.0) | Only needed for `postgresRepository()` or a `pg.Pool` executor |

- Node.js ≥ 18
- PostgreSQL ≥ 14

## Related packages

- **`@airnauts/comments-server`** — defines the `Repository` interface
- **`@airnauts/comments-adapter-mongo`** — MongoDB alternative
- **`@airnauts/comments-adapter-memory`** — in-memory adapter for dev/tests
- **`@airnauts/comments-next`** — Next.js integration that accepts this adapter

## License

MIT © Airnauts
