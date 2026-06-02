import type { ListQuery } from '@airnauts/comments-server'
import { MongoMemoryServer } from 'mongodb-memory-server'
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest'
import { mongoRepository } from './index'

let mongod: MongoMemoryServer
let uri: string

beforeAll(async () => {
  mongod = await MongoMemoryServer.create()
  uri = mongod.getUri()
}, 60_000)

afterAll(async () => {
  // mongoRepository intentionally leaves its MongoClient open for the process
  // lifetime; `vitest run` exits the process, so the open handle is harmless.
  await mongod?.stop()
})

beforeEach(() => {
  ;(globalThis as unknown as { __commentsRepos?: unknown }).__commentsRepos = undefined
})

const query: ListQuery = { projectId: 'p', sort: 'updatedAt', limit: 10 }

it('lazily connects, ensures indexes, and serves queries', async () => {
  const repo = mongoRepository({ uri })
  expect(await repo.listThreads(query)).toEqual({ threads: [], nextCursor: null })
})

it('memoizes one connection per cacheKey across calls', async () => {
  const repo = mongoRepository({ uri })
  await repo.listThreads(query)
  const repos = (globalThis as unknown as { __commentsRepos: Map<string, unknown> }).__commentsRepos
  const cached = repos.get('mongo')
  const repo2 = mongoRepository({ uri })
  await repo2.listThreads(query)
  expect(repos.get('mongo')).toBe(cached)
})
