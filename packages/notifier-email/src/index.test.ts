import type { ThreadId } from '@airnauts/comments-core'
import type { NotificationEvent } from '@airnauts/comments-server'
import { describe, expect, it } from 'vitest'
import { type EmailMessage, type EmailTransport, emailExtension } from './index'

// A reply with one prior participant already active in the thread.
const event: NotificationEvent = {
  type: 'comment.added',
  projectId: 'proj_x',
  threadId: 't_1' as ThreadId,
  pageUrl: 'https://example.com/about',
  pageTitle: 'About',
  threadUrl: 'https://example.com/about?comments-thread=t_1',
  participants: ['watcher@example.com'],
  text: 'Looks off here',
  author: { email: 'alice@example.com', name: 'Alice' },
  createdAt: '2026-06-03T10:00:00.000Z',
}

/** Records every message it was asked to send. */
function fakeTransport(): EmailTransport & { sent: EmailMessage[] } {
  const sent: EmailMessage[] = []
  return {
    name: 'fake',
    sent,
    async send(message) {
      sent.push(message)
    },
  }
}

describe('emailExtension', () => {
  it('returns a single notification extension named "email"', () => {
    const extensions = emailExtension({ transport: fakeTransport(), from: 'c@d.com' })
    expect(extensions).toHaveLength(1)
    expect(extensions[0]!.kind).toBe('notification')
    expect(extensions[0]!.name).toBe('email')
    expect(typeof extensions[0]!.onEvent).toBe('function')
  })

  it('sends to the thread participants (server already excluded the author)', async () => {
    const transport = fakeTransport()
    await emailExtension({ transport, from: 'noreply@d.com' })[0]!.onEvent({
      ...event,
      participants: ['solo@b.com'],
    })
    const msg = transport.sent[0]!
    expect(msg.to).toEqual(['solo@b.com'])
    expect(msg.bcc).toBeUndefined()
    expect(msg.from).toBe('noreply@d.com')
  })

  it('bcc-fans multiple participants and puts the sender in "to"', async () => {
    const transport = fakeTransport()
    await emailExtension({ transport, from: 'noreply@d.com' })[0]!.onEvent({
      ...event,
      participants: ['x@b.com', 'y@b.com'],
    })
    const msg = transport.sent[0]!
    expect(msg.to).toEqual(['noreply@d.com'])
    expect(msg.bcc).toEqual(['x@b.com', 'y@b.com'])
  })

  it('sends nothing when the thread has no other participants', async () => {
    const transport = fakeTransport()
    await emailExtension({ transport, from: 'c@d.com' })[0]!.onEvent({
      ...event,
      participants: [],
    })
    expect(transport.sent).toHaveLength(0)
  })

  it('passes the rendered subject/html/text through', async () => {
    const transport = fakeTransport()
    await emailExtension({ transport, from: 'c@d.com', subjectPrefix: '[Acme] ' })[0]!.onEvent(
      event,
    )
    const msg = transport.sent[0]!
    expect(msg.subject).toBe('[Acme] New reply on About')
    expect(msg.html).toContain('href="https://example.com/about?comments-thread=t_1"')
    expect(msg.text).toContain('Looks off here')
  })

  it('sets reply-to only when provided', async () => {
    const withReply = fakeTransport()
    await emailExtension({
      transport: withReply,
      from: 'c@d.com',
      replyTo: 'team@d.com',
    })[0]!.onEvent(event)
    expect(withReply.sent[0]!.replyTo).toBe('team@d.com')

    const without = fakeTransport()
    await emailExtension({ transport: without, from: 'c@d.com' })[0]!.onEvent(event)
    expect(without.sent[0]!.replyTo).toBeUndefined()
  })

  it('propagates a transport failure (dispatch isolates it upstream)', async () => {
    const boom: EmailTransport = {
      name: 'boom',
      async send() {
        throw new Error('smtp 550')
      },
    }
    await expect(
      emailExtension({ transport: boom, from: 'c@d.com' })[0]!.onEvent(event),
    ).rejects.toThrow('smtp 550')
  })
})
