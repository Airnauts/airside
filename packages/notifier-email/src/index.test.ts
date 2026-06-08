import type { ThreadId } from '@airnauts/comments-core'
import type { NotificationEvent } from '@airnauts/comments-server'
import { describe, expect, it } from 'vitest'
import { type EmailMessage, type EmailTransport, emailNotifier } from './index'

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

/** Records the last message it was asked to send. */
function fakeTransport(): EmailTransport & { sent: EmailMessage[] } {
  const sent: EmailMessage[] = []
  return { name: 'fake', sent, async send(message) { sent.push(message) } }
}

describe('emailNotifier', () => {
  it('exposes a stable name', () => {
    expect(emailNotifier({ transport: fakeTransport(), to: ['a@b.com'], from: 'c@d.com' }).name).toBe(
      'email',
    )
  })

  it('addresses a single recipient in "to"', async () => {
    const transport = fakeTransport()
    await emailNotifier({ transport, to: ['solo@b.com'], from: 'noreply@d.com' }).notify(event)
    const msg = transport.sent[0]!
    expect(msg.to).toEqual(['solo@b.com'])
    expect(msg.bcc).toBeUndefined()
    expect(msg.from).toBe('noreply@d.com')
  })

  it('bcc-fans multiple recipients and puts the sender in "to"', async () => {
    const transport = fakeTransport()
    await emailNotifier({
      transport,
      to: ['x@b.com', 'y@b.com'],
      from: 'noreply@d.com',
    }).notify(event)
    const msg = transport.sent[0]!
    expect(msg.to).toEqual(['noreply@d.com'])
    expect(msg.bcc).toEqual(['x@b.com', 'y@b.com'])
  })

  it('passes the rendered subject/html/text through', async () => {
    const transport = fakeTransport()
    await emailNotifier({
      transport,
      to: ['a@b.com'],
      from: 'c@d.com',
      subjectPrefix: '[Acme] ',
    }).notify(event)
    const msg = transport.sent[0]!
    expect(msg.subject).toBe('[Acme] New comment on About')
    expect(msg.html).toContain('href="https://example.com/about?comments-thread=t_1"')
    expect(msg.text).toContain('Looks off here')
  })

  it('sets reply-to only when provided', async () => {
    const withReply = fakeTransport()
    await emailNotifier({
      transport: withReply,
      to: ['a@b.com'],
      from: 'c@d.com',
      replyTo: 'team@d.com',
    }).notify(event)
    expect(withReply.sent[0]!.replyTo).toBe('team@d.com')

    const without = fakeTransport()
    await emailNotifier({ transport: without, to: ['a@b.com'], from: 'c@d.com' }).notify(event)
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
      emailNotifier({ transport: boom, to: ['a@b.com'], from: 'c@d.com' }).notify(event),
    ).rejects.toThrow('smtp 550')
  })
})
