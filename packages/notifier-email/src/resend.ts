import type { EmailMessage, EmailTransport } from './index'

export type ResendTransportOptions = {
  /** Resend API key (https://resend.com/api-keys). */
  apiKey: string
}

const RESEND_ENDPOINT = 'https://api.resend.com/emails'

/** Abort the request after this many ms so a hung endpoint can't stall a write. */
const TIMEOUT_MS = 5000

export function resendTransport(opts: ResendTransportOptions): EmailTransport {
  return {
    name: 'resend',
    async send(message: EmailMessage): Promise<void> {
      const payload: Record<string, unknown> = {
        from: message.from,
        to: message.to,
        subject: message.subject,
        html: message.html,
        text: message.text,
      }
      if (message.bcc !== undefined) payload.bcc = message.bcc
      if (message.replyTo !== undefined) payload.reply_to = message.replyTo

      const res = await fetch(RESEND_ENDPOINT, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${opts.apiKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      })
      if (!res.ok) {
        // Never include the api key — it is a credential that ends up in logs.
        throw new Error(`resend api responded ${res.status}`)
      }
    },
  }
}
