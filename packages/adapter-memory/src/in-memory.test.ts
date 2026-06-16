import { repositoryContract } from '@airnauts/airside-test-support'
import { InMemoryRepository } from './in-memory'

repositoryContract('InMemoryRepository', async () => new InMemoryRepository())
