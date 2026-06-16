import type { NotificationEvent, NotificationExtension } from '@airnauts/airside-server'
import { formatEmail } from './format'

/** A single outbound email, transport-agnostic. */
export type EmailMessage = {
  to: string[]
  bcc?: string[]
  from: string
  replyTo?: string
  subject: string
  html: string
  text: string
}

/** Pluggable delivery backend (SMTP, Resend, your own). */
export interface EmailTransport {
  /** Human-readable id for failure logging. Never contains credentials. */
  readonly name: string
  send(message: EmailMessage): Promise<void>
}

export type EmailExtensionOptions = {
  /** Where to send: smtpTransport(...) | resendTransport(...) | your own. */
  transport: EmailTransport
  /** Verified sender address. */
  from: string
  /** Optional Reply-To header. */
  replyTo?: string
  /** Optional subject prefix, e.g. "[Acme] ". */
  subjectPrefix?: string
}

export function emailExtension(opts: EmailExtensionOptions): NotificationExtension[] {
  return [
    {
      kind: 'notification',
      name: 'email',
      async onEvent(event: NotificationEvent): Promise<void> {
        // Recipients are the thread's existing participants (the server already
        // excluded this comment's author). A brand-new thread has none, so there
        // is nothing to send.
        const recipients = event.participants
        if (recipients.length === 0) return

        const { subject, html, text } = formatEmail(event, { subjectPrefix: opts.subjectPrefix })
        // >1 recipient → bcc so participants don't see each other's addresses.
        const message: EmailMessage =
          recipients.length > 1
            ? { from: opts.from, to: [opts.from], bcc: recipients, subject, html, text }
            : { from: opts.from, to: recipients, subject, html, text }
        if (opts.replyTo !== undefined) message.replyTo = opts.replyTo
        await opts.transport.send(message)
      },
    },
  ]
}

export type { EmailFormat, FormatEmailOptions } from './format'
export { formatEmail } from './format'
