# Email notifier — design

- **Status:** Approved (brainstorm complete) · **Revised 2026-06-09:** recipients changed from a
  static list to **thread participants** (see §4); added http(s) `pageUrl` restriction (§2.4).
- **Date:** 2026-06-08
- **Inputs:** [`docs/architecture.md`](../../architecture.md) §2/§4 · [`docs/adr.md`](../../adr.md)
  (ADR-0029 notification seam) · [`2026-06-03-slack-notifications-design.md`](./2026-06-03-slack-notifications-design.md)
- **Scope:** A second concrete `Notifier` — **`@airnauts/comments-notifier-email`** —
  that emails reply notifications to the **people already active in the thread** via a **pluggable
  transport** (SMTP and Resend ship in the box; the port stays open for others). As a
  prerequisite, move ownership of the **thread deep-link** out of individual notifiers
  and into the **server**, so the link is built once and every channel shares it.

---

## 1. Goal

When a reviewer replies on a thread, email the people already active in that thread a message
containing **who** wrote it, **what** they wrote, and a **link to the thread**. Two triggers,
reusing the existing seam (ADR-0029):

- a new thread's first comment (`createThread` → `thread.created`) — carries no other participants,
  so it sends nothing (see §4), and
- a reply on an existing thread (`addComment` → `comment.added`) — emails the prior participants.

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
     participants: string[] // NEW: other active commenters, minus this event's author
     text: string
     author: { email: string; name?: string }
     createdAt: string // ISO
   }
   ```

   `pageUrl` and `threadId` remain so channels can still address the raw page. `participants`
   is the distinct set of comment-author emails already on the thread **minus** `author.email`
   — derived here from the thread the use-case already loaded (the email channel uses it, §4;
   Slack ignores it). It is empty for `thread.created`.

3. **`notifier-slack`** stops building the link. Delete its private
   `DEFAULT_THREAD_PARAM`, drop `threadParam` from `SlackNotifierOptions` and
   `FormatOptions`, and read `event.threadUrl`. Update its tests accordingly.

### 2.4 `pageUrl` restricted to http(s)

`threadUrl` is built from `pageUrl`, and notifiers render it into an email `href` / Slack
markdown. A bare `z.url()` accepts `javascript:` and `data:`, so core now validates `pageUrl`
with a shared `HttpUrl = z.url({ protocol: /^https?$/ })` on both `CreateThreadBody` and the
`Thread` schema, closing the active-scheme vector at the source (ADR-0033). Browser hosts are
unaffected — `window.location.href` is always http(s).

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
  /** Verified sender address. */
  from: string
  /** Optional Reply-To header. */
  replyTo?: string
  /** Optional subject prefix, e.g. "[Acme] ". */
  subjectPrefix?: string
}

export function emailNotifier(opts: EmailNotifierOptions): Notifier
```

The returned notifier has `name: 'email'`. There is **no** recipient list and **no** `threadParam`
option — it sends to `event.participants` and reads `event.threadUrl` (§2), both server-built.

Behavior:

- **Recipients.** The notifier sends to `event.participants` — the thread's other active commenters
  (the server already excluded the event's author). **Empty → no send**, which is the
  `thread.created` case (the author is the only participant), so a brand-new thread emails nobody
  until it has a reply. There is deliberately no static "always notify" list — a host wanting that
  supplies its own `Notifier`.
- **Privacy.** A single recipient goes in `to`. More than one goes in `bcc` with `to: [opts.from]`,
  so participants don't see each other's addresses.
- **Subject.** `comment.added` → `"{subjectPrefix}New reply on {pageTitle ?? pageUrl}"` (the
  `thread.created` → `"New comment on …"` form is still rendered but, per the recipient rule, never
  sent). CR/LF are folded out of the subject to block header injection from a crafted `pageTitle`.
- **Body.** HTML **and** plain-text multipart. The HTML part is a minimal document (`<!doctype …>`)
  showing author (name + email), page title, the comment text, and a "View thread" link to
  `event.threadUrl`. The text part is the same content without markup. An empty comment
  (attachment-only root) renders the `"(image comment)"` fallback, matching Slack.
- **Security.** `event.text` and `event.author.name` are user-controlled and are
  **HTML-escaped** in the HTML part. The subject is built from host-provided `pageTitle`, so the
  formatter **folds CR/LF to spaces** itself (covered by a unit test) rather than relying on the
  transport — header injection is blocked before the message reaches nodemailer or the Resend JSON
  API. `pageUrl`/`threadUrl` can no longer carry an active scheme (§2.4).

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
  timeout?: number // connection/greeting/socket cap (ms), default 10_000
}
export function smtpTransport(opts: SmtpTransportOptions): EmailTransport
// name: 'smtp'; wraps nodemailer.createTransport(...).sendMail(...)
// caps connection/greeting/socket timeouts (default 10s) so a hung SMTP server
// can't stall the awaited in-request dispatch (ADR-0029)

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

- **`emailNotifier` core** (the real logic: `participants`-driven recipients, empty → no-send,
  `bcc` rule, subject prefix, deep-link wiring) → tested against a **fake `EmailTransport`** that
  records the `EmailMessage` it receives. No network.
- **`formatEmail`** → subject/HTML/text rendering, HTML escaping, image-only fallback, and the
  CR/LF subject fold.
- **`resendTransport`** → mock global `fetch` (same pattern as the existing Slack test):
  assert the request URL/headers/body, timeout, and non-2xx → throw with no key leak.
- **`smtpTransport`** → mock `nodemailer.createTransport` / `sendMail`; assert the
  message mapping, transporter reuse, and the connection-timeout caps (default + override).
- **Refactor coverage** → update `build-event` tests to assert `threadUrl` **and `participants`**
  (distinct, minus the author), and update the Slack notifier tests to read `event.threadUrl` (its
  own `threadParam` test is removed with the option). Add a `core` test for `threadLink` /
  `DEFAULT_THREAD_PARAM` at its new home, and one asserting `pageUrl` rejects non-http(s) schemes.

---

## 7. Docs & release

- **ADR-0031** — server owns the thread deep-link (`threadUrl` on `NotificationEvent`;
  `threadParam` moves to `core` + server config; notifiers stop building links).
- **ADR-0032** — email notifier + transport port; **recipients are thread participants** (no
  static list), so `thread.created` emails nobody. Consequences note that under ADR-0029 (dispatch
  awaited in-request) the SMTP handshake adds latency, hence the connection-timeout cap.
- **ADR-0033** — `pageUrl` restricted to http(s) (§2.4).
- **Changesets** (fixed group → all bump together; pre-1.0 policy):
  - `@airnauts/comments-core` — **minor** (new `threadLink` / `DEFAULT_THREAD_PARAM` exports;
    http(s)-only `pageUrl`).
  - `@airnauts/comments-server` — **minor** (new `threadParam` option; `threadUrl` + `participants`
    on the event).
  - `@airnauts/comments-notifier-slack` — **minor** (breaking: `threadParam` option
    removed; now reads `event.threadUrl`).
  - `@airnauts/comments-notifier-email` — **minor** (new package).
- **README** for the new package: both transports, the runtime guidance from §5, the participant
  recipient model, and a worked
  `createCommentsServer({ notifiers: [emailNotifier({ transport: resendTransport({ apiKey }), from })] })`
  example.

---

## 8. Out of scope (v1)

YAGNI for the first cut — the seam/port already accommodates these later with no core
change:

- A configurable "always notify" list alongside participants (e.g. a team inbox on every new
  thread) — a host needing it supplies its own `Notifier`.
- Mention-based recipients, and mention or resolve/status-change events (only the two existing
  triggers; `thread.created` is built but, per the recipient rule, never sent).
- Host-overridable email templates (`renderEmail(event)`).
- Built-in SendGrid / SES / Postmark / Mailgun transports (the `EmailTransport` port
  covers them; SMTP also reaches most of them).
