# @airnauts/airside-test-support

Internal test utilities for the `@airnauts/airside-*` monorepo. **Not published to npm.**

This package provides the shared fixture factories and the shared adapter conformance suites used across the monorepo's own unit and integration tests. It is consumed by `@airnauts/airside-adapter-mongo`, `@airnauts/airside-adapter-postgres`, and similar packages to verify that every adapter correctly implements the `Repository` and `StorageAdapter` interfaces.

## Usage

```ts
import {
  makeNewThread,
  makeComment,
  makeAnchor,
  makeAuthor,
  makeAttachment,
  repositoryContract,
  storageContract,
} from '@airnauts/airside-test-support'
```

### Fixture factories

| Factory | Returns | Description |
|---|---|---|
| `makeNewThread(overrides?)` | `NewThread` | A `NewThread` with sensible defaults; pass partial overrides to vary fields |
| `makeCreateThreadBody(overrides?)` | `CreateThreadBody` | A `CreateThreadBody` for use in HTTP-contract tests |
| `makeComment(overrides?)` | `Comment` | A stored `Comment` record for list/read tests |
| `makeAnchor(overrides?)` | `Anchor` | A complete `Anchor` (schema v1) for tests that need a stored anchor |
| `makeAuthor(overrides?)` | `Author` | An `Author` with default email and name |
| `makeAttachment(overrides?)` | `Attachment` | A stored `Attachment` record for attachment-list tests |
| `makeCaptureContext(overrides?)` | `CaptureContext` | A `CaptureContext` (viewport, DPR, UA) for thread creation |

### Adapter contract suites

These `describe` blocks verify that a `Repository` or `StorageAdapter` implementation satisfies the expected behavior contract. They are designed to be called inside a Vitest `describe` block with a factory and any required teardown.

#### `repositoryContract(name, makeRepository)`

```ts
import { repositoryContract } from '@airnauts/airside-test-support'
import { describe } from 'vitest'
import { myRepository } from './my-adapter'

describe('MyAdapter', () => {
  repositoryContract('MyAdapter', async () => myRepository())
})
```

#### `storageContract(name, makeStorage, readBack)`

```ts
import { storageContract } from '@airnauts/airside-test-support'
import { describe } from 'vitest'

describe('MyStorage', () => {
  storageContract(
    'MyStorage',
    async () => myStorage(),
    async (url) => fetchBytes(url), // read back the stored bytes by URL
  )
})
```

## Peer dependencies

| Peer | Required | Notes |
|---|---|---|
| `vitest` | `^3.2.0` | Required: the contract suites call `describe`, `it`, `expect`, `beforeEach` directly |

## Requirements

- Node.js ≥ 18

## Part of the `@airnauts/airside-*` suite

See the [repository root](../../README.md) for an overview of all packages.
