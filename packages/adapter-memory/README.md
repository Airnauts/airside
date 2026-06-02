# @airnauts/comments-adapter-memory

In-memory `Repository` adapter for the Airnauts commenting tool — ephemeral,
process-local storage for local development and tests.

```ts
import { memoryRepository } from '@airnauts/comments-adapter-memory'

const repository = memoryRepository()
```
