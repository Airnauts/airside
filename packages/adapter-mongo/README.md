# @airnauts/comments-adapter-mongo

MongoDB repository adapter for the [Airnauts commenting tool](https://github.com/Airnauts/commenting-tool) server.

## Install

```bash
pnpm add @airnauts/comments-adapter-mongo mongodb
```

## Usage

```ts
import { createMongoRepository, ensureIndexes } from '@airnauts/comments-adapter-mongo'

await ensureIndexes(db)           // once at startup
const repository = createMongoRepository({ db })
```

Pass `repository` to `createCommentsServer` from `@airnauts/comments-server`.

## License

MIT © Airnauts
