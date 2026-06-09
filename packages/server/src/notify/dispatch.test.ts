import type { ThreadId } from '@airnauts/comments-core'
import { describe, expect, it, vi } from 'vitest'
import { dispatchNotifications } from './dispatch'
import type { NotificationEvent, Notifier } from './types'

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
  it('calls notify on every notifier', async () => {
    const a: Notifier = { name: 'a', notify: vi.fn(async () => {}) }
    const b: Notifier = { name: 'b', notify: vi.fn(async () => {}) }
    await dispatchNotifications([a, b], event)
    expect(a.notify).toHaveBeenCalledWith(event)
    expect(b.notify).toHaveBeenCalledWith(event)
  })

  it('does not reject when a notifier throws, and still runs the others', async () => {
    const bad: Notifier = {
      name: 'bad',
      notify: vi.fn(async () => {
        throw new Error('boom')
      }),
    }
    const good: Notifier = { name: 'good', notify: vi.fn(async () => {}) }
    const log = vi.fn()
    await expect(dispatchNotifications([bad, good], event, log)).resolves.toBeUndefined()
    expect(good.notify).toHaveBeenCalled()
    expect(log).toHaveBeenCalledWith(expect.stringContaining('bad'))
  })

  it('does not reject when a notifier throws synchronously, and still runs the others', async () => {
    const sync: Notifier = {
      name: 'sync',
      notify: () => {
        throw new Error('sync boom')
      },
    }
    const good: Notifier = { name: 'good', notify: vi.fn(async () => {}) }
    const log = vi.fn()
    await expect(dispatchNotifications([sync, good], event, log)).resolves.toBeUndefined()
    expect(good.notify).toHaveBeenCalled()
    expect(log).toHaveBeenCalledWith(expect.stringContaining('sync'))
  })

  it('is a no-op for empty or undefined notifiers', async () => {
    await expect(dispatchNotifications([], event)).resolves.toBeUndefined()
    await expect(dispatchNotifications(undefined, event)).resolves.toBeUndefined()
  })
})
