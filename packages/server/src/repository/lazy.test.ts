import { beforeEach, describe, expect, it, vi } from 'vitest'
import { lazyRepository } from './lazy'
import type { ListQuery, Repository } from './types'

// A minimal Repository whose listThreads echoes a sentinel cursor so we can
// assert which underlying instance answered. Other methods are unused here.
function stubRepo(cursor: string | null): Repository {
  return {
    async createThread() {
      return {} as never
    },
    async getThread() {
      return null
    },
    async listThreads() {
      return { threads: [], nextCursor: cursor }
    },
    async addComment() {
      return {} as never
    },
    async setStatus() {
      return {} as never
    },
    async updateAnchor() {
      return {} as never
    },
  }
}

const query: ListQuery = { projectId: 'p', sort: 'updatedAt', limit: 10 }

beforeEach(() => {
  // Reset the cross-call registry between tests.
  ;(globalThis as unknown as { __commentsRepos?: unknown }).__commentsRepos = undefined
})

describe('lazyRepository', () => {
  it('does not connect until the first method call', () => {
    const connect = vi.fn(async () => stubRepo('a'))
    lazyRepository(connect, { cacheKey: 'k1' })
    expect(connect).not.toHaveBeenCalled()
  })

  it('connects once and memoizes across calls with the same cacheKey', async () => {
    const connect = vi.fn(async () => stubRepo('a'))
    const repo = lazyRepository(connect, { cacheKey: 'k2' })
    await repo.listThreads(query)
    await repo.listThreads(query)
    const repo2 = lazyRepository(connect, { cacheKey: 'k2' })
    await repo2.listThreads(query)
    expect(connect).toHaveBeenCalledTimes(1)
  })

  it('uses a separate connection per cacheKey', async () => {
    const connect = vi.fn(async () => stubRepo('a'))
    await lazyRepository(connect, { cacheKey: 'A' }).listThreads(query)
    await lazyRepository(connect, { cacheKey: 'B' }).listThreads(query)
    expect(connect).toHaveBeenCalledTimes(2)
  })

  it('forwards results from the underlying repository', async () => {
    const repo = lazyRepository(async () => stubRepo('hello'), { cacheKey: 'k3' })
    expect((await repo.listThreads(query)).nextCursor).toBe('hello')
  })

  it('clears the cache on connect failure so the next call retries', async () => {
    let n = 0
    const connect = vi.fn(async () => {
      n += 1
      if (n === 1) throw new Error('boom')
      return stubRepo('ok')
    })
    const repo = lazyRepository(connect, { cacheKey: 'k4' })
    await expect(repo.listThreads(query)).rejects.toThrow('boom')
    expect((await repo.listThreads(query)).nextCursor).toBe('ok')
    expect(connect).toHaveBeenCalledTimes(2)
  })

  it('deduplicates concurrent first-calls into a single connect', async () => {
    const connect = vi.fn(async () => stubRepo('x'))
    const repo = lazyRepository(connect, { cacheKey: 'k5' })
    const [r1, r2] = await Promise.all([repo.listThreads(query), repo.listThreads(query)])
    expect(connect).toHaveBeenCalledTimes(1)
    expect(r1.nextCursor).toBe('x')
    expect(r2.nextCursor).toBe('x')
  })

  it('delegates every method to the underlying repository', async () => {
    const inner = stubRepo('z')
    const spies = {
      createThread: vi.spyOn(inner, 'createThread'),
      getThread: vi.spyOn(inner, 'getThread'),
      listThreads: vi.spyOn(inner, 'listThreads'),
      addComment: vi.spyOn(inner, 'addComment'),
      setStatus: vi.spyOn(inner, 'setStatus'),
      updateAnchor: vi.spyOn(inner, 'updateAnchor'),
    }
    const repo = lazyRepository(async () => inner, { cacheKey: 'k6' })
    await repo.createThread({} as never)
    await repo.getThread({ projectId: 'p' }, 'tid' as never)
    await repo.listThreads(query)
    await repo.addComment({ projectId: 'p' }, 'tid' as never, {} as never)
    await repo.setStatus({ projectId: 'p' }, 'tid' as never, 'open', 'now')
    await repo.updateAnchor({ projectId: 'p' }, 'tid' as never, {} as never, 'now')
    for (const spy of Object.values(spies)) expect(spy).toHaveBeenCalledTimes(1)
  })
})
