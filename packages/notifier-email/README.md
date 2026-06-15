# @airnauts/comments-notifier-email

Email notifier for the [Airnauts commenting tool](https://github.com/Airnauts/commenting-tool)
server. When a reviewer replies on a thread, it emails the **people already active in that
thread** (the other comment authors), via a pluggable transport.

## Who gets notified

Recipients are derived per event from the thread itself — there is no recipient list to
configure. On a reply (`comment.added`) the email goes to every other person who has commented on
the thread, **excluding** the author of the reply (you are never emailed about your own comment).
A brand-new thread (`thread.created`) has no other participants yet, so **no email is sent** until
someone replies.

## Transports

| Import | Transport | Runtime |
| --- | --- | --- |
| `@airnauts/comments-notifier-email/resend` | Resend HTTP API (fetch) | serverless / edge safe |
| `@airnauts/comments-notifier-email/smtp` | SMTP via `nodemailer` | Node server only |

`nodemailer` is an **optional peer dependency** — install it only if you use the SMTP transport
(`pnpm add nodemailer`). It is CJS and Node-only, so it will not run on an edge runtime; use the
Resend transport there. You can also implement the exported `EmailTransport` interface yourself
for any other provider (SendGrid, SES, Postmark, …).

## Usage (Resend)

```ts
import { createCommentsServer } from '@airnauts/comments-server'
import { emailNotifications } from '@airnauts/comments-notifier-email'
import { resendTransport } from '@airnauts/comments-notifier-email/resend'

createCommentsServer({
  repository,
  storage,
  extensions: emailNotifications({
    transport: resendTransport({ apiKey: process.env.RESEND_API_KEY! }),
    from: 'Comments <noreply@acme.com>',
  }),
})
```

## Usage (SMTP)

```ts
import { createCommentsServer } from '@airnauts/comments-server'
import { emailNotifications } from '@airnauts/comments-notifier-email'
import { smtpTransport } from '@airnauts/comments-notifier-email/smtp'

createCommentsServer({
  repository,
  storage,
  extensions: emailNotifications({
    transport: smtpTransport({
      host: 'smtp.example.com',
      port: 587,
      auth: { user: process.env.SMTP_USER!, pass: process.env.SMTP_PASS! },
    }),
    from: 'noreply@acme.com',
  }),
})
```

`emailNotifications` also takes optional `replyTo` and `subjectPrefix`. The SMTP transport accepts
an optional `timeout` (ms, default `10000`) capping connection/greeting/socket so a hung server
can't stall the comment write.

A notification failure never breaks the comment write. When a thread has more than one other
participant the addresses go in `bcc` so participants don't see each other's emails. The thread
deep-link in each email is built by the server (`event.threadUrl`).

## License

MIT © Airnauts
