import { ANCHOR_SCHEMA_VERSION, type CommentId, type ThreadId } from '@comments/core'
import { makeCreateThreadBody } from '@comments/test-support'
import { describe, expect, it } from 'vitest'
import { defaultIds, makeCtx } from '../ctx'
import { InMemoryRepository } from '../repository/in-memory'
import { createThread } from './create-thread'

describe('createThread use-case', () => {
  it('persists a thread and returns it', async () => {
    const repo = new InMemoryRepository()
    const now = new Date('2026-05-28T10:00:00.000Z')
    const ctx = makeCtx({
      projectId: 'proj_x',
      now: () => now,
      ids: {
        ...defaultIds(),
        thread: () => 't_fixed' as ThreadId,
        comment: () => 'c_fixed' as CommentId,
      },
    })
    const body = makeCreateThreadBody()
    const thread = await createThread({ ctx, params: undefined, query: undefined, body }, { repo })
    expect(thread.id).toBe('t_fixed')
    expect(thread.status).toBe('open')
    expect(thread.anchorState).toBe('anchored')
    expect(thread.createdAt).toBe(now.toISOString())
    expect(thread.updatedAt).toBe(now.toISOString())
    expect(thread.schemaVersion).toBe(ANCHOR_SCHEMA_VERSION)
    expect(thread.comments).toHaveLength(1)
    expect(thread.comments[0]?.id).toBe('c_fixed')
    expect(thread.comments[0]?.text).toBe('first comment')

    const stored = await repo.getThread({ projectId: 'proj_x' }, thread.id)
    expect(stored?.id).toBe(thread.id)
  })
})
