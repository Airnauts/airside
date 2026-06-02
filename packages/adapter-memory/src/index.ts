import type { Repository } from '@airnauts/comments-server'
import { InMemoryRepository } from './in-memory'

export { InMemoryRepository }

/** Fresh, process-local in-memory `Repository`. No connection, no config. */
export function memoryRepository(): Repository {
  return new InMemoryRepository()
}
