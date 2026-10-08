import type { RealtimeEvent } from '@airnauts/airside-core'
import { describe, expect, it, vi } from 'vitest'
import { InProcessRealtimeChannel } from './channel'

const scope = { projectId: 'p1', env: 'prod' }

function created(pageKey: string | null, id = 't1'): RealtimeEvent {
  return {
    type: 'thread.created',
    pageKey,
    thread: {
      id,
      scope: 'page',
      pageKey,
      pageUrl: 'https://example.com/x',
      anchor: {
        schemaVersion: 1,
        selectors: ['p', 'p'],
        offset: { fx: 0.5, fy: 0.5 },
        signals: { tag: 'p', classes: [], siblingIndex: 0, ancestorTrail: [] },
      },
      status: 'open',
      anchorState: 'anchored',
      commentCount: 1,
      unresolvedCount: 1,
      createdBy: { email: 'a@b.com' },
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      lastActivityAt: '2026-01-01T00:00:00.000Z',
      schemaVersion: 1,
      rootComment: { text: 'hi', createdAt: '2026-01-01T00:00:00.000Z' },
      actions: [],
    },
  }
}

describe('InProcessRealtimeChannel', () => {
  it('delivers a page-scoped event to a subscriber on that page', () => {
    const bus = new InProcessRealtimeChannel()
    const onEvent = vi.fn()
    bus.subscribe(scope, '/docs', onEvent)
    const e = created('/docs')
    bus.publish(scope, e)
    expect(onEvent).toHaveBeenCalledTimes(1)
    expect(onEvent).toHaveBeenCalledWith(e)
  })

  it('does not leak a page event to a subscriber on a different page', () => {
    const bus = new InProcessRealtimeChannel()
    const docs = vi.fn()
    const blog = vi.fn()
    bus.subscribe(scope, '/docs', docs)
    bus.subscribe(scope, '/blog', blog)
    bus.publish(scope, created('/docs'))
    expect(docs).toHaveBeenCalledTimes(1)
    expect(blog).not.toHaveBeenCalled()
  })

  it('delivers every page event to an all-pages (panel) subscriber', () => {
    const bus = new InProcessRealtimeChannel()
    const all = vi.fn()
    bus.subscribe(scope, null, all)
    bus.publish(scope, created('/docs'))
    bus.publish(scope, created('/blog'))
    expect(all).toHaveBeenCalledTimes(2)
  })

  it('delivers a null-pageKey event to all-pages subscribers only, without crashing', () => {
    const bus = new InProcessRealtimeChannel()
    const all = vi.fn()
    const page = vi.fn()
    bus.subscribe(scope, null, all)
    bus.subscribe(scope, '/docs', page)
    const e: RealtimeEvent = {
      type: 'comment.added',
      pageKey: null,
      threadId: 't1',
      comment: {
        id: 'c1',
        author: { email: 'a@b.com' },
        text: 'hi',
        attachments: [],
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    }
    expect(() => bus.publish(scope, e)).not.toThrow()
    expect(all).toHaveBeenCalledTimes(1)
    expect(page).not.toHaveBeenCalled()
  })

  it('isolates scopes: another project/env never receives the event', () => {
    const bus = new InProcessRealtimeChannel()
    const other = vi.fn()
    bus.subscribe({ projectId: 'p2', env: 'prod' }, null, other)
    bus.subscribe({ projectId: 'p1', env: 'staging' }, null, other)
    bus.publish(scope, created('/docs'))
    expect(other).not.toHaveBeenCalled()
  })

  it('stops delivering after unsubscribe and prunes empty buckets', () => {
    const bus = new InProcessRealtimeChannel()
    const onEvent = vi.fn()
    const off = bus.subscribe(scope, '/docs', onEvent)
    bus.publish(scope, created('/docs'))
    off()
    bus.publish(scope, created('/docs'))
    expect(onEvent).toHaveBeenCalledTimes(1)
    expect(bus.subscriberCount(scope)).toBe(0)
  })

  it('a publish with no subscribers is a no-op', () => {
    const bus = new InProcessRealtimeChannel()
    expect(() => bus.publish(scope, created('/docs'))).not.toThrow()
  })

  it('isolates a listener that throws so the rest still receive the event', () => {
    const bus = new InProcessRealtimeChannel()
    const bad = vi.fn(() => {
      throw new Error('boom')
    })
    const good = vi.fn()
    bus.subscribe(scope, null, bad)
    bus.subscribe(scope, null, good)
    expect(() => bus.publish(scope, created('/docs'))).not.toThrow()
    expect(good).toHaveBeenCalledTimes(1)
  })
})
