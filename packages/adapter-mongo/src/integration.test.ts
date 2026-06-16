import { KEY_HEADER_NAME } from '@airnauts/airside-core'
import { createNextHandler } from '@airnauts/airside-next'
import type { StorageAdapter } from '@airnauts/airside-server'
import { createAirsideServer } from '@airnauts/airside-server'
import { makeCreateThreadBody } from '@airnauts/airside-test-support'
import { type Db, MongoClient } from 'mongodb'
import { MongoMemoryServer } from 'mongodb-memory-server'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { createMongoRepository, ensureIndexes } from './index'

const stubStorage: StorageAdapter = {
  async put() {
    return { url: 'https://blob.test/x', key: 'x', size: 0 }
  },
}

let mongod: MongoMemoryServer
let client: MongoClient
let db: Db

beforeAll(async () => {
  mongod = await MongoMemoryServer.create()
  client = new MongoClient(mongod.getUri())
  await client.connect()
  db = client.db('comments_integration')
  await ensureIndexes(db)
}, 60_000)

afterAll(async () => {
  await client?.close()
  await mongod?.stop()
})

const headers = {
  origin: 'https://app.example.com',
  [KEY_HEADER_NAME]: 'sk_test',
  'content-type': 'application/json',
}

it('round-trips a thread through the Next handler against MongoDB', async () => {
  const server = createAirsideServer({
    secretKey: 'sk_test',
    projectId: 'proj_x',
    allowedOrigins: ['https://app.example.com'],
    repository: createMongoRepository({ db }),
    storage: stubStorage,
    rateLimit: { writesPerMin: 1000, readsPerMin: 1000 },
  })
  const { GET, POST } = createNextHandler(server)

  const created = await POST(
    new Request('https://host/api/comments/threads', {
      method: 'POST',
      headers,
      body: JSON.stringify(makeCreateThreadBody()),
    }),
    { params: Promise.resolve({ path: ['threads'] }) },
  )
  expect(created.status).toBe(201)
  const { id } = await created.json()

  const got = await GET(new Request(`https://host/api/comments/threads/${id}`, { headers }), {
    params: Promise.resolve({ path: ['threads', id] }),
  })
  expect(got.status).toBe(200)
  const body = await got.json()
  expect(body.id).toBe(id)
  expect(body.comments).toHaveLength(1)
})
