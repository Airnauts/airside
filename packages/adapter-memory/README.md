<p align="center">
  <a href="https://github.com/Airnauts/airside">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/Airnauts/airside/main/assets/airside-logo-dark.svg">
      <img src="https://raw.githubusercontent.com/Airnauts/airside/main/assets/airside-logo-light.svg" alt="Airside" height="40">
    </picture>
  </a>
</p>

# @airnauts/airside-adapter-memory

In-memory `Repository` adapter for the [Airside](https://github.com/Airnauts/airside) server — ephemeral, process-local storage for local development and tests. State is lost when the process exits; swap in a real persistence adapter for production.

## Installation

```bash
pnpm add @airnauts/airside-adapter-memory
```

## Quick start

```ts
import { createMemoryRepository } from '@airnauts/airside-adapter-memory'

const repository = createMemoryRepository()
```

Pass `repository` to `createAirsideServer` from `@airnauts/airside-server` (or to `createAirsideAppRoute` / `createAirsidePagesRoute` from `@airnauts/airside-integration-next`).

## API reference

### `createMemoryRepository()`

Returns a fresh `Repository` backed by in-process Maps. No configuration, no connection.

### `InMemoryRepository`

The underlying class, exported for use in tests that need direct access to the store:

```ts
import { InMemoryRepository } from '@airnauts/airside-adapter-memory'

const repo = new InMemoryRepository()
```

## Requirements

- Node.js ≥ 18

## Related packages

- **`@airnauts/airside-server`** — defines the `Repository` interface this adapter implements
- **`@airnauts/airside-adapter-mongo`** — MongoDB adapter for production
- **`@airnauts/airside-adapter-postgres`** — PostgreSQL adapter for production

## License

MIT © Airnauts
