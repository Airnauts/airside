import { InMemoryRepository } from '@airnauts/airside-adapter-memory'
import type { AttachmentId, CommentId, ThreadId } from '@airnauts/airside-core'
import { makeAttachment, makeAuthor, makeNewThread } from '@airnauts/airside-test-support'
import { describe, expect, it, vi } from 'vitest'
import { defaultIds, makeCtx } from '../ctx'
import { NotFoundError, ValidationError } from '../errors'
import type { NotificationExtension } from '../extensions/types'
import { addComment } from './add-comment'

const attachment = makeAttachment()

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

  it('resolves attachmentIds into the stored comment', async () => {
    const repo = new InMemoryRepository()
    const ctx = makeCtx({
      projectId: 'proj_x',
      ids: { ...defaultIds(), comment: () => 'c_1' as CommentId },
    })
    await repo.putAttachment({ projectId: 'proj_x' }, attachment)
    const thread = await repo.createThread(makeNewThread({ projectId: 'proj_x' }))
    const out = await addComment(
      {
        ctx,
        params: { id: thread.id },
        query: undefined,
        body: { text: '', attachmentIds: [attachment.id], author: makeAuthor() },
      },
      { repo },
    )
    expect(out.attachments).toEqual([attachment])
    const refetched = await repo.getThread({ projectId: 'proj_x' }, thread.id)
    expect(refetched?.comments.at(-1)?.attachments).toEqual([attachment])
  })

  it('throws ValidationError when an attachmentId cannot be resolved', async () => {
    const repo = new InMemoryRepository()
    const ctx = makeCtx({ projectId: 'proj_x' })
    const thread = await repo.createThread(makeNewThread({ projectId: 'proj_x' }))
    await expect(
      addComment(
        {
          ctx,
          params: { id: thread.id },
          query: undefined,
          body: { text: 'hi', attachmentIds: ['at_missing' as AttachmentId], author: makeAuthor() },
        },
        { repo },
      ),
    ).rejects.toBeInstanceOf(ValidationError)
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

  it('dispatches a comment.added notification carrying the thread page context', async () => {
    const repo = new InMemoryRepository()
    const ctx = makeCtx({ projectId: 'proj_x' })
    const thread = await repo.createThread(makeNewThread({ projectId: 'proj_x' }))
    const onEvent = vi.fn(async () => {})
    const extension: NotificationExtension = { kind: 'notification', name: 'spy', onEvent }
    await addComment(
      {
        ctx,
        params: { id: thread.id },
        query: undefined,
        body: { text: 'reply', author: makeAuthor() },
      },
      { repo, notifications: [extension] },
    )
    expect(onEvent).toHaveBeenCalledOnce()
    const event = onEvent.mock.calls[0]![0]
    expect(event.type).toBe('comment.added')
    expect(event.text).toBe('reply')
    expect(event.threadId).toBe(thread.id)
    expect(event.pageUrl).toBe('https://example.com/about')
  })
})
