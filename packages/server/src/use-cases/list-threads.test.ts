import { InMemoryRepository } from '@airnauts/comments-adapter-memory'
import type { ThreadId } from '@airnauts/comments-core'
import { makeNewThread } from '@airnauts/comments-test-support'
import { describe, expect, it } from 'vitest'
import { makeCtx } from '../ctx'
import { ValidationError } from '../errors'
import { listThreads } from './list-threads'

const ctx = makeCtx({ projectId: 'proj_x' })

async function seed(repo: InMemoryRepository, n: number) {
  for (let i = 0; i < n; i++) {
    await repo.createThread(
      makeNewThread({
        id: `t_${String(i).padStart(2, '0')}` as ThreadId,
        projectId: 'proj_x',
        pageKey: i % 2 ? '/a' : '/b',
        updatedAt: new Date(2026, 0, 1, 0, 0, i).toISOString(),
      }),
    )
  }
}

describe('listThreads use-case', () => {
  it('on-page mode returns only matching pageKey', async () => {
    const repo = new InMemoryRepository()
    await seed(repo, 6)
    const result = await listThreads(
      { ctx, params: undefined, query: { pageKey: '/a' }, body: undefined },
      { repo },
    )
    expect(result.threads.every((t) => t.pageKey === '/a')).toBe(true)
  })

  it('panel mode returns all pages, defaults limit=50', async () => {
    const repo = new InMemoryRepository()
    await seed(repo, 6)
    const result = await listThreads(
      { ctx, params: undefined, query: {}, body: undefined },
      { repo },
    )
    expect(result.threads).toHaveLength(6)
    expect(result.nextCursor).toBeNull()
  })

  it('filters by status', async () => {
    const repo = new InMemoryRepository()
    await seed(repo, 2)
    await repo.setStatus(
      { projectId: 'proj_x' },
      't_00' as ThreadId,
      'resolved',
      '2026-05-01T00:00:00.000Z',
    )
    const open = await listThreads(
      { ctx, params: undefined, query: { status: 'open' }, body: undefined },
      { repo },
    )
    expect(open.threads.every((t) => t.status === 'open')).toBe(true)
  })

  it('passes cursor through', async () => {
    const repo = new InMemoryRepository()
    await seed(repo, 25)
    const first = await listThreads(
      { ctx, params: undefined, query: {}, body: undefined },
      { repo, defaultLimit: 10 },
    )
    expect(first.threads).toHaveLength(10)
    expect(first.nextCursor).not.toBeNull()
    const cursor = first.nextCursor
    if (cursor === null) throw new Error('expected cursor')
    const second = await listThreads(
      { ctx, params: undefined, query: { cursor }, body: undefined },
      { repo, defaultLimit: 10 },
    )
    expect(second.threads).toHaveLength(10)
    expect(second.threads.find((t) => first.threads.some((x) => x.id === t.id))).toBeUndefined()
  })

  it('throws ValidationError when the cursor is malformed', async () => {
    const repo = new InMemoryRepository()
    await expect(
      listThreads(
        { ctx, params: undefined, query: { cursor: '!!!not-base64!!!' }, body: undefined },
        { repo },
      ),
    ).rejects.toBeInstanceOf(ValidationError)
  })
})
