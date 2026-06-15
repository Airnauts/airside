import { InMemoryRepository } from '@airnauts/comments-adapter-memory'
import {
  ANCHOR_SCHEMA_VERSION,
  type AttachmentId,
  type CommentId,
  type ThreadId,
} from '@airnauts/comments-core'
import { makeAttachment, makeCreateThreadBody } from '@airnauts/comments-test-support'
import { describe, expect, it, vi } from 'vitest'
import { defaultIds, makeCtx } from '../ctx'
import { ValidationError } from '../errors'
import { buildExtensionRegistry } from '../extensions/registry'
import type { NotificationExtension } from '../extensions/types'
import { createThread } from './create-thread'

const registry = buildExtensionRegistry([])

const attachment = makeAttachment()

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
    const thread = await createThread(
      { ctx, params: undefined, query: undefined, body },
      { repo, registry },
    )
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
    expect(thread.actions).toEqual([])

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
    const thread = await createThread(
      { ctx, params: undefined, query: undefined, body },
      { repo, registry },
    )
    expect(thread.comments[0]?.attachments).toEqual([attachment])
  })

  it('throws ValidationError when a first-comment attachmentId cannot be resolved', async () => {
    const repo = new InMemoryRepository()
    const ctx = makeCtx({ projectId: 'proj_x' })
    const body = makeCreateThreadBody({
      comment: { text: 'hi', attachmentIds: ['at_missing' as AttachmentId] },
    })
    await expect(
      createThread({ ctx, params: undefined, query: undefined, body }, { repo, registry }),
    ).rejects.toBeInstanceOf(ValidationError)
  })

  it('dispatches a thread.created notification to extensions', async () => {
    const repo = new InMemoryRepository()
    const ctx = makeCtx({ projectId: 'proj_x' })
    const onEvent = vi.fn(async () => {})
    const extension: NotificationExtension = { kind: 'notification', name: 'spy', onEvent }
    const body = makeCreateThreadBody()
    await createThread(
      { ctx, params: undefined, query: undefined, body },
      { repo, registry, notifications: [extension] },
    )
    expect(onEvent).toHaveBeenCalledOnce()
    const event = onEvent.mock.calls[0]![0]
    expect(event.type).toBe('thread.created')
    expect(event.text).toBe('first comment')
    expect(event.author.email).toBe('alice@example.com')
    expect(event.pageUrl).toBe('https://example.com/about')
    expect(event.pageTitle).toBe('About')
    expect(event.threadId).toBeDefined()
  })

  it('does not require notifications (no-op when omitted)', async () => {
    const repo = new InMemoryRepository()
    const ctx = makeCtx({ projectId: 'proj_x' })
    const body = makeCreateThreadBody()
    const thread = await createThread(
      { ctx, params: undefined, query: undefined, body },
      { repo, registry },
    )
    expect(thread.id).toBeDefined()
  })
})
