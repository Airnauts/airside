import { repositoryContract } from '@airnauts/airside-test-support'
import { type Db, MongoClient } from 'mongodb'
import { MongoMemoryServer } from 'mongodb-memory-server'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { createMongoRepository, ensureIndexes } from './index'

let mongod: MongoMemoryServer
let client: MongoClient
let db: Db

beforeAll(async () => {
  mongod = await MongoMemoryServer.create()
  client = new MongoClient(mongod.getUri())
  await client.connect()
  db = client.db('comments_test')
  await ensureIndexes(db)
}, 60_000)

afterAll(async () => {
  await client?.close()
  await mongod?.stop()
})

// The contract suite calls makeRepo in beforeEach and registers no afterEach,
// so isolation lives here: clear the shared collection before each test.
repositoryContract('mongo', async () => {
  await db.collection('threads').deleteMany({})
  return createMongoRepository({ db })
})

it('ensureIndexes creates the three scoped indexes with the expected key specs', async () => {
  const indexes = await db.collection('threads').indexes()
  const byName = new Map(indexes.map((i) => [i.name, i.key]))
  // Assert names AND key specs/directions — keyset pagination depends on
  // projectId_updatedAt sorting updatedAt descending.
  expect(byName.get('projectId_pageKey')).toEqual({ projectId: 1, pageKey: 1 })
  expect(byName.get('projectId_updatedAt')).toEqual({ projectId: 1, updatedAt: -1 })
  expect(byName.get('projectId_status')).toEqual({ projectId: 1, status: 1 })
})
