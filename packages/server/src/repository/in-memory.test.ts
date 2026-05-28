import { repositoryContract } from '@comments/test-support'
import { InMemoryRepository } from './in-memory'

repositoryContract('InMemoryRepository', async () => new InMemoryRepository())
