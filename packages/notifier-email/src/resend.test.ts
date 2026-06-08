import { afterEach, describe, expect, it, vi } from 'vitest'
import type { EmailMessage } from './index'
import { resendTransport } from './resend'

const message: EmailMessage = {
  to: ['noreply@d.com'],
  bcc: ['x@b.com', 'y@b.com'],
  from: 'noreply@d.com',
  replyTo: 'team@d.com',
  subject: 'New comment on About',
  html: '<p>hi</p>',
  text: 'hi',
}

afterEach(() => vi.unstubAllGlobals())

describe('resendTransport', () => {
  it('exposes a stable name', () => {
    expect(resendTransport({ apiKey: 'k' }).name).toBe('resend')
  })

  it('POSTs the message to the Resend API with a bearer token', async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await resendTransport({ apiKey: 'secret-key' }).send(message)

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://api.resend.com/emails')
    expect(init.method).toBe('POST')
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer secret-key')
    const body = JSON.parse(init.body as string)
    expect(body.from).toBe('noreply@d.com')
    expect(body.to).toEqual(['noreply@d.com'])
    expect(body.bcc).toEqual(['x@b.com', 'y@b.com'])
    expect(body.reply_to).toBe('team@d.com')
    expect(body.subject).toBe('New comment on About')
    expect(body.html).toBe('<p>hi</p>')
    expect(body.text).toBe('hi')
  })

  it('omits bcc/reply_to when not set', async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await resendTransport({ apiKey: 'k' }).send({
      to: ['a@b.com'],
      from: 'c@d.com',
      subject: 's',
      html: 'h',
      text: 't',
    })

    const body = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string)
    expect('bcc' in body).toBe(false)
    expect('reply_to' in body).toBe(false)
  })

  it('throws on a non-2xx response without leaking the api key', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('no', { status: 422 })),
    )
    const err = await resendTransport({ apiKey: 'secret-key' })
      .send(message)
      .catch((e) => e as Error)
    expect(err).toBeInstanceOf(Error)
    expect(err.message).toMatch(/422/)
    expect(err.message).not.toContain('secret-key')
  })
})
