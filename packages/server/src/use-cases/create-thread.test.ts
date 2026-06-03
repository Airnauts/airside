import { InMemoryRepository } from '@airnauts/comments-adapter-memory'
import {
  ANCHOR_SCHEMA_VERSION,
  type Attachment,
  type AttachmentId,
  type CommentId,
  type ThreadId,
} from '@airnauts/comments-core'
import { makeCreateThreadBody } from '@airnauts/comments-test-support'
import { describe, expect, it, vi } from 'vitest'
import { defaultIds, makeCtx } from '../ctx'
import { ValidationError } from '../errors'
import type { Notifier } from '../notify/types'
import { createThread } from './create-thread'

const attachment: Attachment = {
  id: 'at_1' as AttachmentId,
  url: 'https://blob.test/at_1',
  name: 'shot.png',
  contentType: 'image/png',
  size: 42,
}

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
    expect(thread.lastActivityAt).toBe(now.toISOString())
    expect(thread.schemaVersion).toBe(ANCHOR_SCHEMA_VERSION)
    expect(thread.comments).toHaveLength(1)
    expect(thread.comments[0]?.id).toBe('c_fixed')
    expect(thread.comments[0]?.text).toBe('first comment')

    const stored = await repo.getThread({ projectId: 'proj_x' }, thread.id)
    expect(stored?.id).toBe(thread.id)
  })

  it('resolves the first comment attachmentIds (image-only first comment allowed)', async () => {
    const repo = new InMemoryRepository()
    const ctx = makeCtx({ projectId: 'proj_x' })
    await repo.putAttachment({ projectId: 'proj_x' }, attachment)
    const body = makeCreateThreadBody({
      comment: { text: '', attachmentIds: [attachment.id] },
    })
    const thread = await createThread({ ctx, params: undefined, query: undefined, body }, { repo })
    expect(thread.comments[0]?.attachments).toEqual([attachment])
  })

  it('throws ValidationError when a first-comment attachmentId cannot be resolved', async () => {
    const repo = new InMemoryRepository()
    const ctx = makeCtx({ projectId: 'proj_x' })
    const body = makeCreateThreadBody({
      comment: { text: 'hi', attachmentIds: ['at_missing' as AttachmentId] },
    })
    await expect(
      createThread({ ctx, params: undefined, query: undefined, body }, { repo }),
    ).rejects.toBeInstanceOf(ValidationError)
  })

  it('dispatches a thread.created notification to notifiers', async () => {
    const repo = new InMemoryRepository()
    const ctx = makeCtx({ projectId: 'proj_x' })
    const notify = vi.fn(async () => {})
    const notifier: Notifier = { name: 'spy', notify }
    const body = makeCreateThreadBody()
    await createThread(
      { ctx, params: undefined, query: undefined, body },
      { repo, notifiers: [notifier] },
    )
    expect(notify).toHaveBeenCalledOnce()
    const event = notify.mock.calls[0]![0]
    expect(event.type).toBe('thread.created')
    expect(event.text).toBe('first comment')
    expect(event.author.email).toBe('alice@example.com')
    expect(event.pageUrl).toBe('https://example.com/about')
    expect(event.pageTitle).toBe('About')
    expect(event.threadId).toBeDefined()
  })

  it('does not require notifiers (no-op when omitted)', async () => {
    const repo = new InMemoryRepository()
    const ctx = makeCtx({ projectId: 'proj_x' })
    const body = makeCreateThreadBody()
    const thread = await createThread({ ctx, params: undefined, query: undefined, body }, { repo })
    expect(thread.id).toBeDefined()
  })
})
