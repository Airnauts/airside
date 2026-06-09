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
