import type { ThreadId } from '@airnauts/comments-core'
import type { NotificationEvent } from '@airnauts/comments-server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { formatSlackMessage, slackExtension } from './index'

const event: NotificationEvent = {
  type: 'thread.created',
  projectId: 'proj_x',
  threadId: 't_1' as ThreadId,
  pageUrl: 'https://example.com/about',
  pageTitle: 'About',
  threadUrl: 'https://example.com/about?airside-thread=t_1',
  participants: [],
  text: 'Looks off here',
  author: { email: 'alice@example.com', name: 'Alice' },
  createdAt: '2026-06-03T10:00:00.000Z',
}

afterEach(() => vi.unstubAllGlobals())

describe('slackExtension', () => {
  it('returns a single notification extension named "slack"', () => {
    const extensions = slackExtension({ webhookUrl: 'https://hooks.slack.com/x' })
    expect(extensions).toHaveLength(1)
    expect(extensions[0]!.kind).toBe('notification')
    expect(extensions[0]!.name).toBe('slack')
    expect(typeof extensions[0]!.onEvent).toBe('function')
  })

  it('POSTs a Block Kit message to the webhook URL', async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await slackExtension({ webhookUrl: 'https://hooks.slack.com/services/T/B/x' })[0]!.onEvent(
      event,
    )

    expect(fetchMock).toHaveBeenCalledOnce()
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://hooks.slack.com/services/T/B/x')
    expect(init.method).toBe('POST')
    const body = JSON.parse(init.body as string)
    expect(body.text).toContain('Alice')
    expect(body.text).toContain('Looks off here')
    expect(JSON.stringify(body.blocks)).toContain('https://example.com/about')
  })

  it('links to the thread deep-link, not the bare page', async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await slackExtension({ webhookUrl: 'https://hooks.slack.com/x' })[0]!.onEvent(event)

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    const blocks = JSON.stringify(JSON.parse(init.body as string).blocks)
    expect(blocks).toContain('https://example.com/about?airside-thread=t_1')
  })

  it('throws on a non-2xx response without leaking the webhook URL', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('no', { status: 500 })),
    )
    const err = await slackExtension({ webhookUrl: 'https://hooks.slack.com/secret-xyz' })[0]!
      .onEvent(event)
      .catch((e) => e as Error)
    expect(err).toBeInstanceOf(Error)
    expect(err.message).toMatch(/500/)
    expect(err.message).not.toContain('secret-xyz')
  })
})

describe('formatSlackMessage', () => {
  it('labels a new thread "New comment" and a reply "New reply"', () => {
    expect(formatSlackMessage(event).text).toContain('New comment')
    expect(formatSlackMessage({ ...event, type: 'comment.added' }).text).toContain('New reply')
  })

  it('falls back to the email when no name is present', () => {
    const msg = formatSlackMessage({ ...event, author: { email: 'bob@example.com' } })
    expect(msg.text).toContain('bob@example.com')
  })

  it('uses an image-comment fallback when the text is empty', () => {
    const msg = formatSlackMessage({ ...event, text: '' })
    expect(msg.text).toContain('(image comment)')
    expect(JSON.stringify(msg.blocks)).toContain('(image comment)')
  })

  it('links each block to the thread deep-link', () => {
    const blocks = JSON.stringify(formatSlackMessage(event).blocks)
    expect(blocks).toContain('https://example.com/about?airside-thread=t_1')
    expect(blocks).not.toContain('|https://example.com/about>') // never a bare page link
  })
})
