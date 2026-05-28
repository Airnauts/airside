import type { CommentId, ThreadId } from '@comments/core'
import { makeAuthor, makeNewThread } from '@comments/test-support'
import { describe, expect, it } from 'vitest'
import { defaultIds, makeCtx } from '../ctx'
import { NotFoundError } from '../errors'
import { InMemoryRepository } from '../repository/in-memory'
import { addComment } from './add-comment'

describe('addComment use-case', () => {
  it('appends a comment and bumps updatedAt', async () => {
    const repo = new InMemoryRepository()
    const now = new Date('2026-06-01T00:00:00.000Z')
    const ctx = makeCtx({
      projectId: 'proj_x',
      now: () => now,
      ids: { ...defaultIds(), comment: () => 'c_new' as CommentId },
    })
    const thread = await repo.createThread(
      makeNewThread({ projectId: 'proj_x', updatedAt: '2026-01-01T00:00:00.000Z' }),
    )
    const out = await addComment(
      {
        ctx,
        params: { id: thread.id },
        query: undefined,
        body: { text: 'reply', author: makeAuthor() },
      },
      { repo },
    )
    expect(out.id).toBe('c_new')
    expect(out.text).toBe('reply')
    const refetched = await repo.getThread({ projectId: 'proj_x' }, thread.id)
    expect(refetched?.updatedAt).toBe(now.toISOString())
  })

  it('throws NotFoundError when the thread does not exist', async () => {
    const repo = new InMemoryRepository()
    const ctx = makeCtx({ projectId: 'proj_x' })
    await expect(
      addComment(
        {
          ctx,
          params: { id: 't_missing' as ThreadId },
          query: undefined,
          body: { text: 'hi', author: makeAuthor() },
        },
        { repo },
      ),
    ).rejects.toBeInstanceOf(NotFoundError)
  })
})
