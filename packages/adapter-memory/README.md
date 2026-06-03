# @airnauts/comments-adapter-memory

In-memory `Repository` adapter for the
[Airnauts commenting tool](https://github.com/Airnauts/commenting-tool) server —
ephemeral, process-local storage for local development and tests. State is lost when
the process exits; pair with a real persistence adapter (e.g.
`@airnauts/comments-adapter-mongo`) for production.

## Install

```bash
pnpm add @airnauts/comments-adapter-memory
```

## Usage

```ts
import { memoryRepository } from '@airnauts/comments-adapter-memory'

const repository = memoryRepository()
```

Pass `repository` to `createCommentsServer` from `@airnauts/comments-server`. The
underlying `InMemoryRepository` class is also exported.

## License

MIT © Airnauts
