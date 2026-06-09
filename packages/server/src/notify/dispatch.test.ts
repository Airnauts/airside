import type { ThreadId } from '@airnauts/comments-core'
import { describe, expect, it, vi } from 'vitest'
import type { NotificationExtension } from '../extensions/types'
import { dispatchNotifications } from './dispatch'
import type { NotificationEvent } from './types'

const event: NotificationEvent = {
  type: 'thread.created',
  projectId: 'proj_x',
  threadId: 't_1' as ThreadId,
  pageUrl: 'https://example.com/about',
  threadUrl: 'https://example.com/about?comments-thread=t_1',
  participants: [],
  text: 'hi',
  author: { email: 'alice@example.com' },
  createdAt: '2026-06-03T10:00:00.000Z',
}

describe('dispatchNotifications', () => {
  it('calls onEvent on every extension', async () => {
    const a: NotificationExtension = { kind: 'notification', name: 'a', onEvent: vi.fn(async () => {}) }
    const b: NotificationExtension = { kind: 'notification', name: 'b', onEvent: vi.fn(async () => {}) }
    await dispatchNotifications([a, b], event)
    expect(a.onEvent).toHaveBeenCalledWith(event)
    expect(b.onEvent).toHaveBeenCalledWith(event)
  })

  it('does not reject when an extension throws, and still runs the others', async () => {
    const bad: NotificationExtension = {
      kind: 'notification',
      name: 'bad',
      onEvent: vi.fn(async () => {
        throw new Error('boom')
      }),
    }
    const good: NotificationExtension = {
      kind: 'notification',
      name: 'good',
      onEvent: vi.fn(async () => {}),
    }
    const log = vi.fn()
    await expect(dispatchNotifications([bad, good], event, log)).resolves.toBeUndefined()
    expect(good.onEvent).toHaveBeenCalled()
    expect(log).toHaveBeenCalledWith(expect.stringContaining('bad'))
  })

  it('does not reject when an extension throws synchronously, and still runs the others', async () => {
    const sync: NotificationExtension = {
      kind: 'notification',
      name: 'sync',
      onEvent: () => {
        throw new Error('sync boom')
      },
    }
    const good: NotificationExtension = {
      kind: 'notification',
      name: 'good',
      onEvent: vi.fn(async () => {}),
    }
    const log = vi.fn()
    await expect(dispatchNotifications([sync, good], event, log)).resolves.toBeUndefined()
    expect(good.onEvent).toHaveBeenCalled()
    expect(log).toHaveBeenCalledWith(expect.stringContaining('sync'))
  })

  it('is a no-op for empty or undefined extensions', async () => {
    await expect(dispatchNotifications([], event)).resolves.toBeUndefined()
    await expect(dispatchNotifications(undefined, event)).resolves.toBeUndefined()
  })
})
