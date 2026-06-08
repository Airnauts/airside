import type { ThreadId } from '@airnauts/comments-core'
import type { NotificationEvent } from '@airnauts/comments-server'
import { describe, expect, it } from 'vitest'
import { escapeHtml, formatEmail } from './format'

const event: NotificationEvent = {
  type: 'thread.created',
  projectId: 'proj_x',
  threadId: 't_1' as ThreadId,
  pageUrl: 'https://example.com/about',
  pageTitle: 'About',
  threadUrl: 'https://example.com/about?comments-thread=t_1',
  text: 'Looks off here',
  author: { email: 'alice@example.com', name: 'Alice' },
  createdAt: '2026-06-03T10:00:00.000Z',
}

describe('escapeHtml', () => {
  it('escapes the five significant characters', () => {
    expect(escapeHtml(`<b>"x" & 'y'</b>`)).toBe('&lt;b&gt;&quot;x&quot; &amp; &#39;y&#39;&lt;/b&gt;')
  })
})

describe('formatEmail', () => {
  it('subjects a new thread "New comment on <where>"', () => {
    expect(formatEmail(event).subject).toBe('New comment on About')
  })

  it('subjects a reply "New reply on <where>"', () => {
    expect(formatEmail({ ...event, type: 'comment.added' }).subject).toBe('New reply on About')
  })

  it('applies a subject prefix', () => {
    expect(formatEmail(event, { subjectPrefix: '[Acme] ' }).subject).toBe('[Acme] New comment on About')
  })

  it('falls back to the page URL when there is no title', () => {
    const { pageTitle: _drop, ...noTitle } = event
    expect(formatEmail(noTitle as NotificationEvent).subject).toBe(
      'New comment on https://example.com/about',
    )
  })

  it('links both parts to the deep-link', () => {
    const out = formatEmail(event)
    expect(out.text).toContain('https://example.com/about?comments-thread=t_1')
    expect(out.html).toContain('href="https://example.com/about?comments-thread=t_1"')
  })

  it('escapes user-controlled text and author name in the HTML part', () => {
    const out = formatEmail({
      ...event,
      text: '<script>alert(1)</script>',
      author: { email: 'a@b.com', name: 'A<b>' },
    })
    expect(out.html).not.toContain('<script>')
    expect(out.html).toContain('&lt;script&gt;')
    expect(out.html).toContain('A&lt;b&gt;')
  })

  it('uses an image-comment fallback when the text is empty', () => {
    const out = formatEmail({ ...event, text: '' })
    expect(out.text).toContain('(image comment)')
    expect(out.html).toContain('(image comment)')
  })

  it('falls back to the email when no name is present', () => {
    const out = formatEmail({ ...event, author: { email: 'bob@example.com' } })
    expect(out.text).toContain('bob@example.com')
  })
})
