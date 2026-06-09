import nodemailer from 'nodemailer'
import type SMTPPool from 'nodemailer/lib/smtp-pool'
import type { EmailMessage, EmailTransport } from './index'

export type SmtpTransportOptions = {
  host: string
  port: number
  /** Use TLS on connect (true for 465, false for 587/STARTTLS). Default false. */
  secure?: boolean
  auth: { user: string; pass: string }
  /** Reuse a connection pool across sends. */
  pool?: boolean
  /**
   * Cap (ms) applied to connection, greeting and socket so a hung SMTP server
   * can't stall the comment write (dispatch is awaited in-request, ADR-0029).
   * Defaults to 10_000; nodemailer's own defaults are ~2 minutes.
   */
  timeout?: number
}

/** Conservative default, well under nodemailer's ~2-minute built-ins. */
const DEFAULT_TIMEOUT_MS = 10_000

export function smtpTransport(opts: SmtpTransportOptions): EmailTransport {
  const timeout = opts.timeout ?? DEFAULT_TIMEOUT_MS
  // One transporter per notifier instance (supports an optional connection pool).
  // nodemailer's overloads split pool (pool:true required) and non-pool SMTP;
  // our options bridge both, so cast through unknown to the pooled-SMTP type
  // which is the superset (SMTPPool.Options extends SMTPTransport.Options).
  const transporter = nodemailer.createTransport({
    host: opts.host,
    port: opts.port,
    secure: opts.secure ?? false,
    auth: { user: opts.auth.user, pass: opts.auth.pass },
    pool: opts.pool,
    connectionTimeout: timeout,
    greetingTimeout: timeout,
    socketTimeout: timeout,
  } as unknown as SMTPPool.Options)
  return {
    name: 'smtp',
    async send(message: EmailMessage): Promise<void> {
      await transporter.sendMail({
        from: message.from,
        to: message.to,
        bcc: message.bcc,
        replyTo: message.replyTo,
        subject: message.subject,
        html: message.html,
        text: message.text,
      })
    },
  }
}
