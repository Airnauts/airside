import { describe, expect, it } from 'vitest'
import { RealtimeEvent, RealtimeEventType } from './realtime'

const listItem = {
  id: 't1',
  scope: 'page' as const,
  pageKey: '/docs',
  pageUrl: 'https://example.com/docs',
  anchor: {
    schemaVersion: 1,
    selectors: ['p', 'p'] as [string, string],
    offset: { fx: 0.5, fy: 0.5 },
    signals: { tag: 'p', classes: [], siblingIndex: 0, ancestorTrail: [] },
  },
  status: 'open' as const,
  anchorState: 'anchored' as const,
  commentCount: 1,
  unresolvedCount: 1,
  createdBy: { email: 'a@b.com' },
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  lastActivityAt: '2026-01-01T00:00:00.000Z',
  schemaVersion: 1,
  rootComment: { text: 'hi', createdAt: '2026-01-01T00:00:00.000Z' },
  actions: [],
}

const comment = {
  id: 'c1',
  author: { email: 'a@b.com' },
  text: 'hello',
  attachments: [],
  createdAt: '2026-01-01T00:00:00.000Z',
}

describe('RealtimeEventType', () => {
  it('enumerates the three v1 event types', () => {
    expect(RealtimeEventType.options).toEqual(['thread.created', 'comment.added', 'thread.updated'])
  })
})

describe('RealtimeEvent', () => {
  it('parses a thread.created event carrying the full list-item view', () => {
    const e = { type: 'thread.created', pageKey: '/docs', thread: listItem }
    expect(RealtimeEvent.parse(e)).toEqual(e)
  })

  it('parses a comment.added event with thread id + comment', () => {
    const e = { type: 'comment.added', pageKey: '/docs', threadId: 't1', comment }
    expect(RealtimeEvent.parse(e)).toEqual(e)
  })

  it('parses a thread.updated event with status + anchorState', () => {
    const e = {
      type: 'thread.updated',
      pageKey: '/docs',
      threadId: 't1',
      status: 'resolved',
      anchorState: 'orphaned',
    }
    expect(RealtimeEvent.parse(e)).toEqual(e)
  })

  it('allows a null pageKey (page-less thread / all-pages only)', () => {
    const e = { type: 'comment.added', pageKey: null, threadId: 't1', comment }
    expect(RealtimeEvent.parse(e)).toEqual(e)
  })

  it('rejects an unknown event type', () => {
    expect(() => RealtimeEvent.parse({ type: 'thread.deleted', pageKey: null })).toThrow()
  })

  it('rejects a comment.added event missing its comment', () => {
    expect(() =>
      RealtimeEvent.parse({ type: 'comment.added', pageKey: '/docs', threadId: 't1' }),
    ).toThrow()
  })
})
