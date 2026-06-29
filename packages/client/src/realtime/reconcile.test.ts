import type { Comment, RealtimeEvent, ThreadListItem } from '@airnauts/airside-core'
import { describe, expect, it, vi } from 'vitest'
import { reconcilePanelEvent, reconcilePinEvent } from './reconcile'

const LOCAL = 'me@x.com'

const listItem = { id: 't1', status: 'open', anchorState: 'anchored' } as unknown as ThreadListItem

function comment(email: string, id = 'c1'): Comment {
  return {
    id,
    author: { email },
    text: 'hi',
    attachments: [],
    createdAt: '2026-01-01T00:00:00.000Z',
  }
}

const created: RealtimeEvent = { type: 'thread.created', pageKey: '/p', thread: listItem as never }
const updated: RealtimeEvent = {
  type: 'thread.updated',
  pageKey: '/p',
  threadId: 't1',
  status: 'resolved',
  anchorState: 'orphaned',
}
const remoteComment: RealtimeEvent = {
  type: 'comment.added',
  pageKey: '/p',
  threadId: 't1',
  comment: comment('other@x.com'),
}
const ownComment: RealtimeEvent = {
  type: 'comment.added',
  pageKey: '/p',
  threadId: 't1',
  comment: comment(LOCAL),
}

describe('reconcilePinEvent', () => {
  const ops = () => ({ addItem: vi.fn(), ingestComment: vi.fn(), patchStatus: vi.fn() })

  it('places a created thread', () => {
    const o = ops()
    reconcilePinEvent(created, LOCAL, o)
    expect(o.addItem).toHaveBeenCalledWith(listItem)
  })

  it('ingests a remote comment but suppresses the local author own echo', () => {
    const o1 = ops()
    reconcilePinEvent(remoteComment, LOCAL, o1)
    expect(o1.ingestComment).toHaveBeenCalledTimes(1)

    const o2 = ops()
    reconcilePinEvent(ownComment, LOCAL, o2)
    expect(o2.ingestComment).not.toHaveBeenCalled()
  })

  it('patches status on thread.updated', () => {
    const o = ops()
    reconcilePinEvent(updated, LOCAL, o)
    expect(o.patchStatus).toHaveBeenCalledWith('t1', 'resolved')
  })
})

describe('reconcilePanelEvent', () => {
  const ops = () => ({ upsertThread: vi.fn(), applyComment: vi.fn(), patchStatus: vi.fn() })

  it('upserts a created thread row', () => {
    const o = ops()
    reconcilePanelEvent(created, LOCAL, o)
    expect(o.upsertThread).toHaveBeenCalledWith(listItem)
  })

  it('applies a remote comment once but suppresses the local author own echo', () => {
    const o1 = ops()
    reconcilePanelEvent(remoteComment, LOCAL, o1)
    expect(o1.applyComment).toHaveBeenCalledWith('t1', 'c1')

    const o2 = ops()
    reconcilePanelEvent(ownComment, LOCAL, o2)
    expect(o2.applyComment).not.toHaveBeenCalled()
  })

  it('patches status + anchorState on thread.updated', () => {
    const o = ops()
    reconcilePanelEvent(updated, LOCAL, o)
    expect(o.patchStatus).toHaveBeenCalledWith('t1', 'resolved', 'orphaned')
  })
})
