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
}

export function smtpTransport(opts: SmtpTransportOptions): EmailTransport {
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
