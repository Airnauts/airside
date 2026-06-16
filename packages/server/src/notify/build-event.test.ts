import type { AuthorId, ThreadId } from '@airnauts/airside-core'
import { describe, expect, it } from 'vitest'
import { buildNotificationEvent } from './build-event'

const comment = {
  text: 'Looks off here',
  author: { id: 'a_1' as AuthorId, email: 'alice@example.com', name: 'Alice' },
  createdAt: '2026-06-03T10:00:00.000Z',
}
// A freshly created thread holds only the author's first comment.
const thread = {
  id: 't_1' as ThreadId,
  pageUrl: 'https://example.com/about',
  pageTitle: 'About',
  comments: [{ author: comment.author }],
}

describe('buildNotificationEvent', () => {
  it('maps thread + comment into a thread.created event with a deep-link', () => {
    const event = buildNotificationEvent(
      'thread.created',
      { projectId: 'proj_x' },
      thread,
      comment,
      'airside-thread',
    )
    expect(event).toEqual({
      type: 'thread.created',
      projectId: 'proj_x',
      threadId: 't_1',
      pageUrl: 'https://example.com/about',
      pageTitle: 'About',
      threadUrl: 'https://example.com/about?airside-thread=t_1',
      participants: [],
      text: 'Looks off here',
      author: { email: 'alice@example.com', name: 'Alice' },
      createdAt: '2026-06-03T10:00:00.000Z',
    })
  })

  it('lists the prior thread participants, distinct and minus the event author', () => {
    const event = buildNotificationEvent(
      'comment.added',
      { projectId: 'proj_x' },
      {
        id: 't_1' as ThreadId,
        pageUrl: 'https://example.com/about',
        comments: [
          { author: { email: 'alice@example.com', name: 'Alice' } },
          { author: { email: 'carol@example.com' } },
          { author: { email: 'alice@example.com', name: 'Alice' } }, // duplicate
        ],
      },
      // bob is replying — he is the actor, never a recipient of his own comment
      {
        text: 'on it',
        author: { email: 'bob@example.com' },
        createdAt: '2026-06-03T12:00:00.000Z',
      },
      'airside-thread',
    )
    expect(event.participants).toEqual(['alice@example.com', 'carol@example.com'])
  })

  it('excludes the author even when they replied to their own thread', () => {
    const event = buildNotificationEvent(
      'comment.added',
      { projectId: 'proj_x' },
      {
        id: 't_1' as ThreadId,
        pageUrl: 'https://example.com/about',
        comments: [{ author: { email: 'alice@example.com' } }],
      },
      {
        text: 'bump',
        author: { email: 'alice@example.com' },
        createdAt: '2026-06-03T12:00:00.000Z',
      },
      'airside-thread',
    )
    expect(event.participants).toEqual([])
  })

  it('builds the deep-link with a custom param', () => {
    const event = buildNotificationEvent(
      'thread.created',
      { projectId: 'proj_x' },
      thread,
      comment,
      'c-thread',
    )
    expect(event.threadUrl).toBe('https://example.com/about?c-thread=t_1')
  })

  it('omits env, pageTitle and name when absent', () => {
    const event = buildNotificationEvent(
      'comment.added',
      { projectId: 'proj_x' },
      { id: 't_2' as ThreadId, pageUrl: 'https://example.com/', comments: [] },
      { text: 'hi', author: { email: 'bob@example.com' }, createdAt: '2026-06-03T11:00:00.000Z' },
      'airside-thread',
    )
    expect(event.env).toBeUndefined()
    expect(event.pageTitle).toBeUndefined()
    expect(event.author.name).toBeUndefined()
    expect('name' in event.author).toBe(false)
  })

  it('includes env when the scope carries one', () => {
    const event = buildNotificationEvent(
      'thread.created',
      { projectId: 'proj_x', env: 'staging' },
      thread,
      comment,
      'airside-thread',
    )
    expect(event.env).toBe('staging')
  })
})
