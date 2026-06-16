# @airnauts/comments-notifier-email

Email notification extension for the [Airnauts commenting tool](https://github.com/Airnauts/commenting-tool) server. Emails the existing thread participants whenever someone replies — so reviewers are notified without a dedicated notification inbox.

## Installation

```bash
pnpm add @airnauts/comments-notifier-email
# For SMTP transport only — not needed for the Resend transport:
pnpm add nodemailer
```

## Who gets notified

Recipients are derived per event from the thread itself. On a reply (`comment.added`) the email goes to every other person who has commented, **excluding the reply author** (you are never emailed about your own comment). A brand-new thread (`thread.created`) has no other participants yet, so no email is sent. With more than one recipient, addresses go in `bcc` so participants do not see each other's emails.

## Quick start

### Resend (recommended for serverless / edge)

```ts
import { createCommentsServer } from '@airnauts/comments-server'
import { emailExtension } from '@airnauts/comments-notifier-email'
import { resendTransport } from '@airnauts/comments-notifier-email/resend'

createCommentsServer({
  repository,
  storage,
  secretKey: process.env.AIRSIDE_SECRET!,
  projectId: 'my-app',
  allowedOrigins: ['https://my-app.example.com'],
  extensions: emailExtension({
    transport: resendTransport({ apiKey: process.env.RESEND_API_KEY! }),
    from: 'Comments <noreply@acme.com>',
  }),
})
```

### SMTP (Node server)

```ts
import { emailExtension } from '@airnauts/comments-notifier-email'
import { smtpTransport } from '@airnauts/comments-notifier-email/smtp'

extensions: emailExtension({
  transport: smtpTransport({
    host: 'smtp.example.com',
    port: 587,
    auth: { user: process.env.SMTP_USER!, pass: process.env.SMTP_PASS! },
  }),
  from: 'noreply@acme.com',
  replyTo: 'support@acme.com',
  subjectPrefix: '[Acme] ',
})
```

## API reference

### `emailExtension(opts)` (main entry)

```ts
emailExtension({
  transport: EmailTransport   // Delivery backend (required)
  from: string                // Verified sender address (required)
  replyTo?: string            // Reply-To header
  subjectPrefix?: string      // Prepended to every subject, e.g. "[Acme] "
}): NotificationExtension[]
```

Notification failures are isolated — a hung or erroring transport never breaks the comment write.

### `resendTransport(opts)` (`@airnauts/comments-notifier-email/resend`)

```ts
resendTransport({
  apiKey: string  // Resend API key (required)
}): EmailTransport
```

Uses the Resend HTTP API; safe on edge runtimes. The request is bounded by a 5-second timeout.

### `smtpTransport(opts)` (`@airnauts/comments-notifier-email/smtp`)

```ts
smtpTransport({
  host: string
  port: number
  auth: { user: string; pass: string }
  secure?: boolean   // TLS on connect; default false (use for port 465)
  pool?: boolean     // Reuse a connection pool across sends
  timeout?: number   // Cap (ms) on connection/greeting/socket; default 10000
}): EmailTransport
```

Node-only (uses `nodemailer`). Requires `nodemailer` to be installed separately. Not supported on edge runtimes.

### `EmailTransport` interface

Implement this to use any other email provider (SendGrid, SES, Postmark, …):

```ts
interface EmailTransport {
  readonly name: string
  send(message: EmailMessage): Promise<void>
}
```

### `formatEmail(event, opts?)`

```ts
import { formatEmail } from '@airnauts/comments-notifier-email'

const { subject, html, text } = formatEmail(event, { subjectPrefix: '[Acme] ' })
```

Renders a `NotificationEvent` into an email. Exported for testing or custom dispatch.

### Types

| Export | From | Description |
|---|---|---|
| `EmailExtensionOptions` | `.` | Options for `emailExtension` |
| `EmailTransport` | `.` | Pluggable delivery backend interface |
| `EmailMessage` | `.` | `{ to, bcc?, from, replyTo?, subject, html, text }` |
| `EmailFormat` | `.` | `{ subject: string; html: string; text: string }` |
| `FormatEmailOptions` | `.` | `{ subjectPrefix?: string }` |
| `ResendTransportOptions` | `./resend` | Options for `resendTransport` |
| `SmtpTransportOptions` | `./smtp` | Options for `smtpTransport` |

## Peer dependencies & requirements

| Peer | Required | Notes |
|---|---|---|
| `nodemailer` | Optional (≥6) | Only needed for `@airnauts/comments-notifier-email/smtp` |

- Node.js ≥ 18 for the Resend transport; Node.js ≥ 18 for SMTP (CJS, not edge-safe)

## Related packages

- **`@airnauts/comments-server`** — defines `NotificationExtension` and `NotificationEvent`
- **`@airnauts/comments-notifier-slack`** — Slack notification alternative
- **`@airnauts/comments-integration-jira`** — Jira thread-action extension

## License

MIT © Airnauts
