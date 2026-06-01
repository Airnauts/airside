import { repositoryContract } from '@airnauts/comments-test-support'
import { InMemoryRepository } from './in-memory'

repositoryContract('InMemoryRepository', async () => new InMemoryRepository())
