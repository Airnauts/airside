import type { AuthorId, ThreadId } from '@airnauts/comments-core'
import { describe, expect, it } from 'vitest'
import { buildNotificationEvent } from './build-event'

const thread = { id: 't_1' as ThreadId, pageUrl: 'https://example.com/about', pageTitle: 'About' }
const comment = {
  text: 'Looks off here',
  author: { id: 'a_1' as AuthorId, email: 'alice@example.com', name: 'Alice' },
  createdAt: '2026-06-03T10:00:00.000Z',
}

describe('buildNotificationEvent', () => {
  it('maps thread + comment into a thread.created event', () => {
    const event = buildNotificationEvent('thread.created', { projectId: 'proj_x' }, thread, comment)
    expect(event).toEqual({
      type: 'thread.created',
      projectId: 'proj_x',
      threadId: 't_1',
      pageUrl: 'https://example.com/about',
      pageTitle: 'About',
      text: 'Looks off here',
      author: { email: 'alice@example.com', name: 'Alice' },
      createdAt: '2026-06-03T10:00:00.000Z',
    })
  })

  it('omits env, pageTitle and name when absent', () => {
    const event = buildNotificationEvent(
      'comment.added',
      { projectId: 'proj_x' },
      { id: 't_2' as ThreadId, pageUrl: 'https://example.com/' },
      { text: 'hi', author: { email: 'bob@example.com' }, createdAt: '2026-06-03T11:00:00.000Z' },
    )
    expect(event.env).toBeUndefined()
    expect(event.pageTitle).toBeUndefined()
    expect(event.author.name).toBeUndefined()
    expect('name' in event.author).toBe(false)
  })

  it('includes env when the scope carries one', () => {
    const event = buildNotificationEvent('thread.created', { projectId: 'proj_x', env: 'staging' }, thread, comment)
    expect(event.env).toBe('staging')
  })
})
