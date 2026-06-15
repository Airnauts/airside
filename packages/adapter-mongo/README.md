# @airnauts/comments-adapter-mongo

MongoDB repository adapter for the [Airnauts commenting tool](https://github.com/Airnauts/commenting-tool) server. Persists threads and attachments to a MongoDB Atlas (or self-hosted) database.

## Installation

```bash
pnpm add @airnauts/comments-adapter-mongo mongodb
```

## Quick start

```ts
import { mongoRepository } from '@airnauts/comments-adapter-mongo'

const repository = mongoRepository({ uri: process.env.MONGODB_URI! })
```

Pass `repository` to `createCommentsServer` from `@airnauts/comments-server` (or to `createCommentsRoute` from `@airnauts/comments-next`). The adapter connects lazily on first use.

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
import { createMongoRepository, ensureIndexes } from '@airnauts/comments-adapter-mongo'
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

- **`@airnauts/comments-server`** — defines the `Repository` interface
- **`@airnauts/comments-adapter-postgres`** — PostgreSQL alternative
- **`@airnauts/comments-adapter-memory`** — in-memory adapter for dev/tests
- **`@airnauts/comments-next`** — Next.js integration that accepts this adapter

## License

MIT © Airnauts
