import type { ThreadId } from '@comments/core'
import { makeNewThread } from '@comments/test-support'
import { describe, expect, it } from 'vitest'
import { makeCtx } from '../ctx'
import { NotFoundError } from '../errors'
import { InMemoryRepository } from '../repository/in-memory'
import { setThreadStatus } from './set-thread-status'

const ctx = (now: string) => makeCtx({ projectId: 'proj_x', now: () => new Date(now) })

describe('setThreadStatus use-case', () => {
  it('resolves an open thread', async () => {
    const repo = new InMemoryRepository()
    const t = await repo.createThread(makeNewThread({ projectId: 'proj_x' }))
    const out = await setThreadStatus(
      {
        ctx: ctx('2026-06-01T00:00:00.000Z'),
        params: { id: t.id },
        query: undefined,
        body: { status: 'resolved' },
      },
      { repo },
    )
    expect(out.status).toBe('resolved')
    expect(out.updatedAt).toBe('2026-06-01T00:00:00.000Z')
  })

  it('is a no-op when status already matches', async () => {
    const repo = new InMemoryRepository()
    const t = await repo.createThread(
      makeNewThread({ projectId: 'proj_x', updatedAt: '2026-01-01T00:00:00.000Z' }),
    )
    const out = await setThreadStatus(
      {
        ctx: ctx('2026-06-01T00:00:00.000Z'),
        params: { id: t.id },
        query: undefined,
        body: { status: 'open' },
      },
      { repo },
    )
    expect(out.status).toBe('open')
    expect(out.updatedAt).toBe('2026-06-01T00:00:00.000Z')
  })

  it('throws NotFoundError when the thread does not exist', async () => {
    const repo = new InMemoryRepository()
    await expect(
      setThreadStatus(
        {
          ctx: ctx('2026-06-01T00:00:00.000Z'),
          params: { id: 't_missing' as ThreadId },
          query: undefined,
          body: { status: 'resolved' },
        },
        { repo },
      ),
    ).rejects.toBeInstanceOf(NotFoundError)
  })
})
