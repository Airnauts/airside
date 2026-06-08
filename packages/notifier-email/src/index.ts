import type { NotificationEvent, Notifier } from '@airnauts/comments-server'
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

export type EmailNotifierOptions = {
  /** Where to send: smtpTransport(...) | resendTransport(...) | your own. */
  transport: EmailTransport
  /**
   * Static recipient list. Must be non-empty; length 0 is a misconfiguration
   * and the resulting behaviour is transport-defined.
   */
  to: string[]
  /** Verified sender address. */
  from: string
  /** Optional Reply-To header. */
  replyTo?: string
  /** Optional subject prefix, e.g. "[Acme] ". */
  subjectPrefix?: string
}

export function emailNotifier(opts: EmailNotifierOptions): Notifier {
  return {
    name: 'email',
    async notify(event: NotificationEvent): Promise<void> {
      const { subject, html, text } = formatEmail(event, { subjectPrefix: opts.subjectPrefix })
      // >1 recipient → bcc so reviewers don't see each other's addresses.
      const message: EmailMessage =
        opts.to.length > 1
          ? { from: opts.from, to: [opts.from], bcc: opts.to, subject, html, text }
          : { from: opts.from, to: opts.to, subject, html, text }
      if (opts.replyTo !== undefined) message.replyTo = opts.replyTo
      await opts.transport.send(message)
    },
  }
}

export type { EmailFormat, FormatEmailOptions } from './format'
export { formatEmail } from './format'
