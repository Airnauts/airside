import { beforeEach, describe, expect, it, vi } from 'vitest'

// vi.mock factories are hoisted before const declarations; use vi.hoisted so
// the mock variables are available when the factory runs.
const { sendMail, createTransport } = vi.hoisted(() => {
  const sendMail = vi.fn(async () => ({ messageId: 'x' }))
  const createTransport = vi.fn(() => ({ sendMail }))
  return { sendMail, createTransport }
})

// Mock the nodemailer default export the transport imports.
vi.mock('nodemailer', () => ({ default: { createTransport } }))

import type { EmailMessage } from './index'
import { smtpTransport } from './smtp'

const message: EmailMessage = {
  to: ['noreply@d.com'],
  bcc: ['x@b.com', 'y@b.com'],
  from: 'noreply@d.com',
  replyTo: 'team@d.com',
  subject: 'New comment on About',
  html: '<p>hi</p>',
  text: 'hi',
}

beforeEach(() => {
  sendMail.mockClear()
  createTransport.mockClear()
})

describe('smtpTransport', () => {
  it('exposes a stable name', () => {
    expect(smtpTransport({ host: 'h', port: 587, auth: { user: 'u', pass: 'p' } }).name).toBe(
      'smtp',
    )
  })

  it('creates one transporter from the connection options', () => {
    smtpTransport({
      host: 'smtp.example.com',
      port: 465,
      secure: true,
      auth: { user: 'u', pass: 'p' },
    })
    expect(createTransport).toHaveBeenCalledWith({
      host: 'smtp.example.com',
      port: 465,
      secure: true,
      auth: { user: 'u', pass: 'p' },
      pool: undefined,
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 10_000,
    })
  })

  it('applies a custom timeout to all three connection caps', () => {
    smtpTransport({ host: 'h', port: 587, auth: { user: 'u', pass: 'p' }, timeout: 2000 })
    expect(createTransport).toHaveBeenCalledWith(
      expect.objectContaining({
        connectionTimeout: 2000,
        greetingTimeout: 2000,
        socketTimeout: 2000,
      }),
    )
  })

  it('maps an EmailMessage onto sendMail', async () => {
    await smtpTransport({ host: 'h', port: 587, auth: { user: 'u', pass: 'p' } }).send(message)
    expect(sendMail).toHaveBeenCalledWith({
      from: 'noreply@d.com',
      to: ['noreply@d.com'],
      bcc: ['x@b.com', 'y@b.com'],
      replyTo: 'team@d.com',
      subject: 'New comment on About',
      html: '<p>hi</p>',
      text: 'hi',
    })
  })

  it('reuses one transporter across sends', async () => {
    const transport = smtpTransport({ host: 'h', port: 587, auth: { user: 'u', pass: 'p' } })
    await transport.send(message)
    await transport.send(message)
    expect(createTransport).toHaveBeenCalledTimes(1)
    expect(sendMail).toHaveBeenCalledTimes(2)
  })
})
