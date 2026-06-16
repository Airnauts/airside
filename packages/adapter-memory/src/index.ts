import type { Repository } from '@airnauts/airside-server'
import { InMemoryRepository } from './in-memory'

export { InMemoryRepository }

/** Fresh, process-local in-memory `Repository`. No connection, no config. */
export function createMemoryRepository(): Repository {
  return new InMemoryRepository()
}

/** @deprecated Renamed to {@link createMemoryRepository}; kept for one release. */
export const memoryRepository = createMemoryRepository
