# @airnauts/comments-adapter-mongo

MongoDB repository adapter for the [Airnauts commenting tool](https://github.com/Airnauts/commenting-tool) server.

## Install

```bash
pnpm add @airnauts/comments-adapter-mongo mongodb
```

## Usage

The simplest path — pass a connection string and let the adapter connect lazily on
first use (sharing the connection across hot-reloads via `cacheKey`) and ensure its
indexes for you:

```ts
import { mongoRepository } from '@airnauts/comments-adapter-mongo'

const repository = mongoRepository({ uri: process.env.MONGODB_URI! })
```

If you manage your own `Db` instance, build the repository against it directly and
create the indexes once at startup:

```ts
import { createMongoRepository, ensureIndexes } from '@airnauts/comments-adapter-mongo'

await ensureIndexes(db)           // once at startup
const repository = createMongoRepository({ db })
```

Pass `repository` to `createCommentsServer` from `@airnauts/comments-server`.

## License

MIT © Airnauts
