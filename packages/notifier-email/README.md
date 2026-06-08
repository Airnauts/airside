# @airnauts/comments-notifier-email

Email notifier for the [Airnauts commenting tool](https://github.com/Airnauts/commenting-tool)
server. Emails a fixed recipient list whenever a reviewer creates a thread or replies, via a
pluggable transport.

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
import { emailNotifier } from '@airnauts/comments-notifier-email'
import { resendTransport } from '@airnauts/comments-notifier-email/resend'

createCommentsServer({
  repository,
  storage,
  notifiers: [
    emailNotifier({
      transport: resendTransport({ apiKey: process.env.RESEND_API_KEY! }),
      to: ['design-team@acme.com'],
      from: 'Comments <noreply@acme.com>',
    }),
  ],
})
```

## Usage (SMTP)

```ts
import { emailNotifier } from '@airnauts/comments-notifier-email'
import { smtpTransport } from '@airnauts/comments-notifier-email/smtp'

emailNotifier({
  transport: smtpTransport({
    host: 'smtp.example.com',
    port: 587,
    auth: { user: process.env.SMTP_USER!, pass: process.env.SMTP_PASS! },
  }),
  to: ['a@acme.com', 'b@acme.com'], // >1 → sent via bcc
  from: 'noreply@acme.com',
})
```

A notification failure never breaks the comment write. With more than one recipient the list is
sent via `bcc` so reviewers don't see each other's addresses. The thread deep-link in each email
is built by the server (`event.threadUrl`).
