<p align="center">
  <a href="https://github.com/Airnauts/airside">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/Airnauts/airside/main/assets/airside-logo-dark.svg">
      <img src="https://raw.githubusercontent.com/Airnauts/airside/main/assets/airside-logo-light.svg" alt="Airside" height="40">
    </picture>
  </a>
</p>

# @airnauts/airside-adapter-mongo

MongoDB repository adapter for the [Airside](https://github.com/Airnauts/airside) server. Persists threads and attachments to a MongoDB Atlas (or self-hosted) database.

## Installation

```bash
pnpm add @airnauts/airside-adapter-mongo mongodb
```

## Quick start

```ts
import { mongoRepository } from '@airnauts/airside-adapter-mongo'

const repository = mongoRepository({ uri: process.env.MONGODB_URI! })
```

Pass `repository` to `createAirsideServer` from `@airnauts/airside-server` (or to `createAirsideAppRoute` / `createAirsidePagesRoute` from `@airnauts/airside-integration-next`). The adapter connects lazily on first use.

## API reference

### `mongoRepository(opts)`

The recommended factory for most setups. Connects lazily on first use and memoizes the connection under a `cacheKey` so hot reloads and warm serverless invocations share the same client.

```ts
mongoRepository({
  uri: string       // MongoDB connection string (required)
  cacheKey?: string // memoization key, default "mongo"
}): Repository
```

### `createMongoRepository(opts)`

Lower-level factory for callers that manage their own `Db` instance:

```ts
import { createMongoRepository, ensureIndexes } from '@airnauts/airside-adapter-mongo'
import { MongoClient } from 'mongodb'

const client = new MongoClient(process.env.MONGODB_URI!)
const db = client.db()
await ensureIndexes(db)
const repository = createMongoRepository({ db })
```

### `ensureIndexes(db)`

Creates the required indexes on the `threads` and `attachments` collections. Safe to call on every startup (`createIndexes` is idempotent). Call once during app boot when using `createMongoRepository`.

> The `mongoRepository` convenience calls `ensureIndexes` automatically the first time it connects.

## Requirements

- Node.js ≥ 18
- MongoDB ≥ 5.0 (Atlas or self-hosted)
- `mongodb` ^6.12.0 (peer dependency, installed separately)

## Related packages

- **`@airnauts/airside-server`** — defines the `Repository` interface
- **`@airnauts/airside-adapter-postgres`** — PostgreSQL alternative
- **`@airnauts/airside-adapter-memory`** — in-memory adapter for dev/tests
- **`@airnauts/airside-integration-next`** — Next.js integration that accepts this adapter

## License

MIT © Airnauts
