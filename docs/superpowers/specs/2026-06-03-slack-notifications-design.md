# Slack notifications — design

- **Status:** Approved (brainstorm complete)
- **Date:** 2026-06-03
- **Inputs:** [`docs/architecture.md`](../../architecture.md) §2/§4 · [`docs/adr.md`](../../adr.md)
- **Scope:** Add an outbound **notification seam** to the server and a first concrete
  that posts new-comment notifications to **Slack** via an Incoming Webhook. The seam
  is generic (email and others plug in later with no core change); only Slack ships now.

---

## 1. Goal

When a reviewer posts a comment, send a Slack message containing **who** wrote it,
**what** they wrote, and a **link to the page**. Two triggers:

- a new thread's first comment (`createThread`), and
- a reply on an existing thread (`addComment`).

A notification failure must **never** break the comment write.

---

## 2. New seam: `Notifier` (output port in `@airnauts/comments-server`)

A notifier is an injected output port, alongside `Repository` and `StorageAdapter`
(hexagonal architecture). It lives in `packages/server/src/notify/types.ts` and is
re-exported from the server index.

```ts
export type NotificationEvent = {
  type: 'thread.created' | 'comment.added'
  projectId: string
  env?: string
  threadId: ThreadId
  pageUrl: string
  pageTitle?: string
  text: string
  author: { email: string; name?: string }
  createdAt: string // ISO
}

export interface Notifier {
  /** Human-readable id used only for logging on failure (never log credentials). */
  readonly name: string
  notify(event: NotificationEvent): Promise<void>
}
```

---

## 3. Wiring — `notifiers[]` on the existing options

`CreateCommentsServerOptions` gains an optional field:

```ts
notifiers?: Notifier[]
```

Because `@airnauts/comments-next`'s `createCommentsRoute` spreads its config straight
into `createCommentsServer`, **no change is required in the `next` package** — the
field flows through automatically.

Integrator usage:

```ts
createCommentsServer({
  repository,
  storage,
  notifiers: [slackNotifier({ webhookUrl: process.env.COMMENTS_SLACK_WEBHOOK_URL! })],
})
```

---

## 4. Dispatch — inside the use cases, failure-isolated

Notifiers are passed into the `createThread` / `addComment` use-case deps:

```ts
type CreateThreadDeps = { repo: Repository; notifiers?: Notifier[] }
type AddCommentDeps   = { repo: Repository; notifiers?: Notifier[] }
```

`notifiers` is **optional with an empty-array default** so the existing use-case test
suites keep compiling unchanged; new tests cover the notify behavior.

After the repository write succeeds, each use case builds an event via a shared helper
and hands it to a dispatcher:

- `buildNotificationEvent(type, { projectId, env }, thread, comment)` — one helper shared
  by both use cases so the `thread.created` and `comment.added` payloads cannot drift.
  - `createThread` has the full new `Thread` + first comment.
  - `addComment` reuses the already-fetched `existing` thread for `pageUrl` / `pageTitle`.
- `dispatchNotifications(notifiers, event)` — fans out with `Promise.allSettled`. A
  notifier that rejects is logged (`name` + a short reason, **never the webhook URL**)
  and is swallowed, so the comment write always succeeds.

Dispatch is **awaited within the request** (not fire-and-forget): in a serverless host
a detached promise is dropped when the function freezes after the response. `allSettled`
catches rejections, so the only residual risk is a *hang* — bounded in the Slack
concrete (§5). The trade-off is that the Slack round-trip is added to the comment-POST
latency; acceptable for v1, and a future `waitUntil`-style hook can move it off the
request path without changing this seam.

---

## 5. Slack concrete: `@airnauts/comments-notifier-slack`

A new publishable package mirroring the `storage-fs` layout (package.json, tsup,
vitest, README, LICENSE). Depends on `@airnauts/comments-server` (for the `Notifier`
type) and `@airnauts/comments-core`.

```ts
slackNotifier({ webhookUrl }: { webhookUrl: string }): Notifier
```

- POSTs Slack Block Kit JSON to `webhookUrl` using the **global `fetch`** (no injected
  fetch — tests stub the global with `vi.stubGlobal`).
- The fetch is bounded with `AbortSignal.timeout(3000)` so a hanging Slack endpoint
  cannot stall the comment write (`allSettled` catches rejections, not hangs).
- Non-2xx response → throws (caught and logged by the dispatcher).
- `name` is `"slack"`.

Message format (the reply variant reads "New reply"):

```
💬 New comment · <pageTitle or pageUrl>
> {text}
{name} ({email}) · <pageUrl|Open page>
```

**Link granularity (v1, confirmed):** the link is the bare `pageUrl`. A Slack recipient
who clicks it sees comments only if they already hold the activation key (localStorage
or `?comments-key=…`). Embedding the key and a `?comment=<threadId>` deep-link is a
documented follow-up, out of scope here.

---

## 6. Tests (TDD, red → green)

Backend is built test-first (ADR-0010). Write each failing test before its implementation.

- `packages/notifier-slack/src/index.test.ts`
  - posts the expected Block Kit payload to `webhookUrl` (assert on the captured request);
  - throws on a non-2xx response;
  - distinguishes `thread.created` ("New comment") from `comment.added` ("New reply").
- `packages/server/src/notify/dispatch.test.ts`
  - fans the event out to every notifier;
  - a throwing notifier does not reject the dispatch (others still run);
  - logs failures without throwing.
- `packages/server/src/use-cases/create-thread.test.ts` / `add-comment.test.ts`
  - a spy notifier in deps receives an event with the correct `type`, `text`, `author`,
    `pageUrl`, `pageTitle`, `threadId`;
  - omitting `notifiers` is a no-op (existing tests stay green).

---

## 7. Docs & release

- **ADR-0029** — "Notification seam + Slack notifier": output-port seam, awaited
  failure-isolated dispatch, bounded webhook timeout, page-only link in v1.
- Update `architecture.md` §2 (package list) and §4 (server construction / use cases)
  to mention the `Notifier` seam.
- Add a "Slack notifications" section to `integration.md`: how to create the Incoming
  Webhook and set `COMMENTS_SLACK_WEBHOOK_URL`.
- Changesets: `@airnauts/comments-server` (minor — new `notifiers` option) and the new
  `@airnauts/comments-notifier-slack` (initial release). Pre-1.0 bump policy per the
  `writing-changesets` skill.

---

## 8. How to test it (operator checklist)

You need **one secret — a Slack Incoming Webhook URL**. No channel name and no bot
token (the channel is baked into the URL).

1. Slack → create (or pick) an app → **Incoming Webhooks** → enable.
2. **Add New Webhook to Workspace** → choose the channel → copy the
   `https://hooks.slack.com/services/…` URL.
3. Set `COMMENTS_SLACK_WEBHOOK_URL` in the host (`examples/nextjs-host`) and wire
   `notifiers: [slackNotifier({ webhookUrl: process.env.COMMENTS_SLACK_WEBHOOK_URL! })]`.
4. Post a comment from the playground → the message appears in the channel.

---

## 9. Out of scope (follow-ups)

- Email and other notifier concretes (the seam supports them; none ship here).
- Deep links carrying the activation key and `?comment=<threadId>`.
- Per-event-type filtering / per-notifier routing, batching/digests, retries.
- Moving dispatch off the request path (`waitUntil`).
