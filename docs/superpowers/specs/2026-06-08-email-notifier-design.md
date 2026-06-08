# Email notifier — design

- **Status:** Approved (brainstorm complete)
- **Date:** 2026-06-08
- **Inputs:** [`docs/architecture.md`](../../architecture.md) §2/§4 · [`docs/adr.md`](../../adr.md)
  (ADR-0029 notification seam) · [`2026-06-03-slack-notifications-design.md`](./2026-06-03-slack-notifications-design.md)
- **Scope:** A second concrete `Notifier` — **`@airnauts/comments-notifier-email`** —
  that emails new-comment notifications to a static recipient list via a **pluggable
  transport** (SMTP and Resend ship in the box; the port stays open for others). As a
  prerequisite, move ownership of the **thread deep-link** out of individual notifiers
  and into the **server**, so the link is built once and every channel shares it.

---

## 1. Goal

When a reviewer posts a comment, email a fixed list of recipients containing **who**
wrote it, **what** they wrote, and a **link to the thread**. Two triggers, reusing the
existing seam (ADR-0029):

- a new thread's first comment (`createThread` → `thread.created`), and
- a reply on an existing thread (`addComment` → `comment.added`).

A notification failure must **never** break the comment write — this is already
guaranteed by `dispatchNotifications` (`Promise.allSettled`, failures logged by
notifier `name`).

The email notifier implements the existing `Notifier` output port unchanged:

```ts
export interface Notifier {
  readonly name: string
  notify(event: NotificationEvent): Promise<void>
}
```

No change to how notifiers are registered (`notifiers?: Notifier[]` on
`createCommentsServer`) or dispatched.

---

## 2. Prerequisite refactor: the server owns the thread deep-link

### 2.1 The problem

The deep-link (`pageUrl?comments-thread=<threadId>`) is a contract between two parties
that never share a runtime:

- the **widget** (browser) *reads* the query param to focus a thread on load
  (`packages/client/src/index.ts` `consumeThreadParam`, default
  `DEFAULT_THREAD_PARAM` in `packages/client/src/config.ts`);
- a **notifier** (server-side) *writes* the param into the link.

Today the Slack notifier re-declares its own private `DEFAULT_THREAD_PARAM` and accepts
a `threadParam` option (`packages/notifier-slack/src/index.ts`). The constant is
therefore defined **twice**, configured **twice**, with nothing enforcing the two
values match. Adding a third notifier (email) that copies the pattern would define it a
**third** time. The server itself currently has no knowledge of the param.

The link is byte-identical for every channel, so no notifier should be constructing it.

### 2.2 The fix

1. **`core`** becomes the single source of truth. Move `DEFAULT_THREAD_PARAM` and the
   `threadLink(pageUrl, threadId, param)` helper from `packages/client/src/config.ts`
   into `@airnauts/comments-core` and export them. `client/config.ts` imports them from
   core and deletes its local copies — widget behavior is unchanged.

2. **`server`** builds the link once. `createCommentsServer` gains one optional
   `threadParam?: string` (defaults to the core constant) — the single server-side
   source of truth. `buildNotificationEvent` constructs the full deep-link via core's
   `threadLink` and adds **`threadUrl: string`** to `NotificationEvent`:

   ```ts
   export type NotificationEvent = {
     type: NotificationEventType
     projectId: string
     env?: string
     threadId: ThreadId
     pageUrl: string
     pageTitle?: string
     threadUrl: string // NEW: ready-made deep-link, built by the server
     text: string
     author: { email: string; name?: string }
     createdAt: string // ISO
   }
   ```

   `pageUrl` and `threadId` remain so channels can still address the raw page.

3. **`notifier-slack`** stops building the link. Delete its private
   `DEFAULT_THREAD_PARAM`, drop `threadParam` from `SlackNotifierOptions` and
   `FormatOptions`, and read `event.threadUrl`. Update its tests accordingly.

### 2.3 Cross-runtime agreement

The widget and the server are different processes, so the param cannot be one literal
value. But both the widget default and the server default now come from the **same
core constant**, so the zero-config case (essentially every host) auto-agrees. A host
that renames the param sets it in exactly **two** places — widget config and server
config — never per-notifier.

This is a **breaking** change to `SlackNotifierOptions` (an option is removed). Pre-1.0
policy → **minor** bump (see §7).

---

## 3. The transport port

The email notifier delegates the actual send to an injected `EmailTransport`. This is
the extension point: SMTP and Resend ship as built-ins; any host can supply its own
(SendGrid, SES, Postmark, …) without a package change.

```ts
export type EmailMessage = {
  to: string[]
  bcc?: string[]
  from: string
  replyTo?: string
  subject: string
  html: string
  text: string
}

export interface EmailTransport {
  /** Human-readable id for failure logging. Never contains credentials. */
  readonly name: string
  send(message: EmailMessage): Promise<void>
}
```

Both `EmailMessage` and `EmailTransport` are exported from the package root so hosts can
type their own transports.

---

## 4. The notifier factory

```ts
export type EmailNotifierOptions = {
  /** Where to send: smtpTransport(...) | resendTransport(...) | your own. */
  transport: EmailTransport
  /** Static recipient list. */
  to: string[]
  /** Verified sender address. */
  from: string
  /** Optional Reply-To header. */
  replyTo?: string
  /** Optional subject prefix, e.g. "[Acme] ". */
  subjectPrefix?: string
}

export function emailNotifier(opts: EmailNotifierOptions): Notifier
```

The returned notifier has `name: 'email'`. There is **no** `threadParam` option — it
reads `event.threadUrl` (§2).

Behavior:

- **Recipients / privacy.** With a single recipient, address it in `to`. With more than
  one, put the list in `bcc` and set `to: [opts.from]` so recipients don't see each
  other's addresses.
- **Subject.** `thread.created` → `"{subjectPrefix}New comment on {pageTitle ?? pageUrl}"`;
  `comment.added` → `"{subjectPrefix}New reply on {pageTitle ?? pageUrl}"`.
- **Body.** HTML **and** plain-text multipart. The HTML part shows author
  (name + email), page title, the comment text, and a "View thread" button linking to
  `event.threadUrl`. The text part is the same content without markup. An empty comment
  (attachment-only root) renders the `"(image comment)"` fallback, matching Slack.
- **Security.** `event.text` and `event.author.name` are user-controlled and are
  **HTML-escaped** in the HTML part. The subject is built from host-provided
  `pageTitle`; both built-in transports sanitize header newlines (nodemailer and the
  Resend JSON API), so this is verified in tests rather than hand-rolled.

---

## 5. Built-in transports (subpath exports)

To keep the package root dependency-free, transports are separate entry points; a host
imports only what it uses.

| Import | Exports | Provider dependency | Runtime |
| --- | --- | --- | --- |
| `@airnauts/comments-notifier-email` | `emailNotifier`, `EmailTransport`, `EmailMessage` | none | any |
| `@airnauts/comments-notifier-email/smtp` | `smtpTransport` | `nodemailer` (optional peer) | Node server only |
| `@airnauts/comments-notifier-email/resend` | `resendTransport` | none (fetch) | serverless / edge safe |

```ts
// /smtp
export type SmtpTransportOptions = {
  host: string
  port: number
  secure?: boolean
  auth: { user: string; pass: string }
  pool?: boolean
}
export function smtpTransport(opts: SmtpTransportOptions): EmailTransport
// name: 'smtp'; wraps nodemailer.createTransport(...).sendMail(...)

// /resend
export type ResendTransportOptions = { apiKey: string }
export function resendTransport(opts: ResendTransportOptions): EmailTransport
// name: 'resend'; POST https://api.resend.com/emails
// AbortSignal.timeout(5000); throws status-only on non-2xx (no key in the message)
```

**Runtime guidance (documented in README + ADR).** `nodemailer` is CJS and Node-only —
it will not run on an edge runtime; use the SMTP transport on a Node server. The Resend
transport is fetch-based and runs anywhere. This split is the whole reason the
transports are separate entry points. The package build must handle the ESM↔CJS interop
on the `nodemailer` import; `nodemailer` is declared as an **optional peer dependency**
(`peerDependenciesMeta` → optional) with `@types/nodemailer` as a dev dependency.

---

## 6. Testing (TDD, ADR-0010)

Backend/adapter packages are built test-first. The port-based design keeps the bulk of
the logic network-free.

- **`emailNotifier` core** (the real logic: recipient/`bcc` rule, subject building,
  deep-link wiring, HTML escaping, image-only fallback) → tested against a **fake
  `EmailTransport`** that records the `EmailMessage` it receives. No network.
- **`resendTransport`** → mock global `fetch` (same pattern as the existing Slack test):
  assert the request URL/headers/body, timeout, and non-2xx → throw with no key leak.
- **`smtpTransport`** → mock `nodemailer.createTransport` / `sendMail`; assert the
  message mapping.
- **Refactor coverage** → update `build-event` tests to assert `threadUrl`, and update
  the Slack notifier tests to read `event.threadUrl` (its own `threadParam` test is
  removed with the option). Add a `core` test for `threadLink` / `DEFAULT_THREAD_PARAM`
  at its new home.

---

## 7. Docs & release

- **ADR-0031** — server owns the thread deep-link (`threadUrl` on `NotificationEvent`;
  `threadParam` moves to `core` + server config; notifiers stop building links).
- **ADR-0032** — email notifier + transport port. Consequences note that under
  ADR-0029 (dispatch awaited in-request to survive serverless freeze) the SMTP
  connection handshake adds more comment-POST latency than the HTTP-based Slack/Resend
  channels.
- **Changesets** (fixed group → all bump together; pre-1.0 policy):
  - `@airnauts/comments-core` — **minor** (new `threadLink` / `DEFAULT_THREAD_PARAM`
    exports).
  - `@airnauts/comments-server` — **minor** (new `threadParam` option; `threadUrl` on
    the event).
  - `@airnauts/comments-notifier-slack` — **minor** (breaking: `threadParam` option
    removed; now reads `event.threadUrl`).
  - `@airnauts/comments-notifier-email` — **minor** (new package).
- **README** for the new package: both transports, the runtime guidance from §5, and a
  worked `createCommentsServer({ notifiers: [emailNotifier({ transport: resendTransport({ apiKey }), to, from })] })`
  example.

---

## 8. Out of scope (v1)

YAGNI for the first cut — the seam/port already accommodates these later with no core
change:

- Dynamic / participant / mention-based recipients (static list only).
- Mention or resolve/status-change events (only the two existing triggers).
- Host-overridable email templates (`renderEmail(event)`).
- Built-in SendGrid / SES / Postmark / Mailgun transports (the `EmailTransport` port
  covers them; SMTP also reaches most of them).
