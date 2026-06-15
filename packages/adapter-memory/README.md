# @airnauts/comments-adapter-memory

In-memory `Repository` adapter for the [Airnauts commenting tool](https://github.com/Airnauts/commenting-tool) server — ephemeral, process-local storage for local development and tests. State is lost when the process exits; swap in a real persistence adapter for production.

## Installation

```bash
pnpm add @airnauts/comments-adapter-memory
```

## Quick start

```ts
import { createMemoryRepository } from '@airnauts/comments-adapter-memory'

const repository = createMemoryRepository()
```

Pass `repository` to `createCommentsServer` from `@airnauts/comments-server` (or to `createCommentsAppRoute` / `createCommentsPagesRoute` from `@airnauts/comments-next`).

## API reference

### `createMemoryRepository()`

Returns a fresh `Repository` backed by in-process Maps. No configuration, no connection.

### `InMemoryRepository`

The underlying class, exported for use in tests that need direct access to the store:

```ts
import { InMemoryRepository } from '@airnauts/comments-adapter-memory'

const repo = new InMemoryRepository()
```

## Requirements

- Node.js ≥ 18

## Related packages

- **`@airnauts/comments-server`** — defines the `Repository` interface this adapter implements
- **`@airnauts/comments-adapter-mongo`** — MongoDB adapter for production
- **`@airnauts/comments-adapter-postgres`** — PostgreSQL adapter for production

## License

MIT © Airnauts
