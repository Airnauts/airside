# Email Notifier Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `@airnauts/comments-notifier-email` — a second `Notifier` that emails new-comment notifications to a static recipient list via a pluggable transport (SMTP + Resend built in) — and first move thread deep-link construction into the server so every channel shares one ready-made `threadUrl`.

**Architecture:** Hexagonal output port reuse. The deep-link constant/helper move into `core` (single source of truth); the server builds `event.threadUrl` once in `buildNotificationEvent` (param fed from `Ctx`); Slack drops its private copy and reads `event.threadUrl`; the new email package implements the existing `Notifier` port and delegates the actual send to an injected `EmailTransport` (SMTP via nodemailer, Resend via fetch, both as subpath exports).

**Tech Stack:** TypeScript (ESM, `verbatimModuleSyntax`), tsup + `tsc --build --force`, Vitest (node env), pnpm workspaces, Changesets (fixed group), nodemailer (optional peer dep), Resend HTTP API.

---

## Spec

Source of truth: [`docs/superpowers/specs/2026-06-08-email-notifier-design.md`](../specs/2026-06-08-email-notifier-design.md).

## Worktree / build note (read once before starting)

This plan edits **four** packages (`core`, `server`, `notifier-slack`, new `notifier-email`). Per the project's worktree gotcha, symlinked `node_modules` make `@airnauts/*` resolve to **main's** `dist`, so cross-package source edits aren't seen until rebuilt. After Task 4 creates the new package, run `pnpm install` from the worktree root once, and whenever a downstream package can't see an upstream source change, rebuild in dependency order:

```bash
pnpm --filter @airnauts/comments-core build
pnpm --filter @airnauts/comments-server build
pnpm --filter @airnauts/comments-notifier-slack build
pnpm --filter @airnauts/comments-notifier-email build
```

Lint gate is `pnpm lint` (`biome ci`); run it before the final commit of each task that adds files.

## File Structure

**Modified:**
- `packages/core/src/deep-link.ts` — **new**: `DEFAULT_THREAD_PARAM` + `threadLink()` (moved from client).
- `packages/core/src/index.ts` — export `./deep-link`.
- `packages/core/src/deep-link.test.ts` — **new**: unit test for the moved helpers.
- `packages/client/src/config.ts` — re-export the two symbols from core; delete the local copies.
- `packages/server/src/ctx.ts` — `threadParam` on `Ctx` / `CtxInit` (default from core).
- `packages/server/src/notify/types.ts` — add `threadUrl: string` to `NotificationEvent`.
- `packages/server/src/notify/build-event.ts` — accept `threadParam`, build `threadUrl`.
- `packages/server/src/notify/build-event.test.ts` — assert `threadUrl`; pass the new arg.
- `packages/server/src/server.ts` — `threadParam?` option; thread into `makeCtx`.
- `packages/server/src/use-cases/create-thread.ts` + `add-comment.ts` — pass `ctx.threadParam`.
- `packages/notifier-slack/src/index.ts` — delete the local param + `threadLink`; read `event.threadUrl`.
- `packages/notifier-slack/src/index.test.ts` — drop the custom-param test; add `threadUrl` to the fixture.
- `.changeset/config.json` — add the new package to the fixed group.

**Created (new package `packages/notifier-email/`):**
- `package.json`, `tsconfig.json`, `tsup.config.ts`, `vitest.config.ts`, `README.md`, `LICENSE`
- `src/format.ts` + `src/format.test.ts` — subject/HTML/text rendering + HTML escaping.
- `src/index.ts` + `src/index.test.ts` — `emailNotifier`, `EmailTransport`, `EmailMessage`.
- `src/resend.ts` + `src/resend.test.ts` — Resend HTTP transport.
- `src/smtp.ts` + `src/smtp.test.ts` — SMTP/nodemailer transport.

**Docs:** `docs/adr.md` (ADR-0031, ADR-0032); changeset files under `.changeset/`.

---

## Task 1: Move the deep-link helper into `core`

**Files:**
- Create: `packages/core/src/deep-link.ts`
- Create: `packages/core/src/deep-link.test.ts`
- Modify: `packages/core/src/index.ts:1-14`
- Modify: `packages/client/src/config.ts:1-31`

- [ ] **Step 1: Write the failing test**

Create `packages/core/src/deep-link.test.ts`:

```typescript
import { describe, expect, it } from 'vitest'
import { DEFAULT_THREAD_PARAM, threadLink } from './deep-link'

describe('threadLink', () => {
  it('appends the default thread param', () => {
    expect(threadLink('https://example.com/about', 't_1')).toBe(
      'https://example.com/about?comments-thread=t_1',
    )
  })

  it('honours a custom param', () => {
    expect(threadLink('https://example.com/a', 't_2', 'c-thread')).toBe(
      'https://example.com/a?c-thread=t_2',
    )
  })

  it('preserves existing query params', () => {
    expect(threadLink('https://example.com/a?ref=1', 't_3')).toBe(
      'https://example.com/a?ref=1&comments-thread=t_3',
    )
  })

  it('exposes the default param constant', () => {
    expect(DEFAULT_THREAD_PARAM).toBe('comments-thread')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @airnauts/comments-core test -- deep-link`
Expected: FAIL — `Cannot find module './deep-link'`.

- [ ] **Step 3: Create the implementation**

Create `packages/core/src/deep-link.ts`:

```typescript
export const DEFAULT_THREAD_PARAM = 'comments-thread'

/** Build a deep-link URL that focuses a thread on its page. */
export function threadLink(
  pageUrl: string,
  threadId: string,
  param = DEFAULT_THREAD_PARAM,
): string {
  const url = new URL(pageUrl)
  url.searchParams.set(param, threadId)
  return url.toString()
}
```

- [ ] **Step 4: Export it from the core barrel**

In `packages/core/src/index.ts`, add this line in alphabetical position (after `export * from './contract/wire'`, before `export * from './ids'`):

```typescript
export * from './deep-link'
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @airnauts/comments-core test -- deep-link`
Expected: PASS (4 tests).

- [ ] **Step 6: Repoint the client to core's copy**

Replace the whole top of `packages/client/src/config.ts` (lines 1-31) — i.e. delete the local `DEFAULT_THREAD_PARAM` const and the `threadLink` function and re-export them from core. The file becomes:

```typescript
import { type CaptureContext, normalizePageKey, type Provenance } from '@airnauts/comments-core'

export type Features = {
  screenshots?: boolean
  textAnchors?: boolean
}

export type InitOptions = {
  key: string
  endpoint: string
  pageKey?: (url: string) => string
  keyParam?: string
  threadParam?: string
  features?: Features
  provenance?: Provenance
}

export const DEFAULT_KEY_PARAM = 'comments-key'

export { DEFAULT_THREAD_PARAM, threadLink } from '@airnauts/comments-core'

export function resolvePageKey(opts: InitOptions, url: string): string {
  return opts.pageKey ? opts.pageKey(url) : normalizePageKey(url)
}

export function buildCaptureContext(win: Window = window): CaptureContext {
  return {
    viewportW: Math.max(1, Math.round(win.innerWidth)),
    viewportH: Math.max(1, Math.round(win.innerHeight)),
    devicePixelRatio: win.devicePixelRatio || 1,
    userAgent: win.navigator.userAgent,
  }
}
```

(`packages/client/src/index.ts` is unchanged — it still imports `DEFAULT_THREAD_PARAM` from `./config`, which now re-exports it.)

- [ ] **Step 7: Verify client still builds & passes**

Run: `pnpm --filter @airnauts/comments-core build && pnpm --filter @airnauts/comments-client test`
Expected: PASS (the client's existing thread-param tests still pass against the re-exported symbols).

- [ ] **Step 8: Commit**

```bash
git add packages/core/src/deep-link.ts packages/core/src/deep-link.test.ts packages/core/src/index.ts packages/client/src/config.ts
git commit -m "refactor(core): own the thread deep-link helper (move from client)"
```

---

## Task 2: Server builds `threadUrl` on the notification event

**Files:**
- Modify: `packages/server/src/notify/types.ts:5-15`
- Modify: `packages/server/src/notify/build-event.ts:1-30`
- Modify: `packages/server/src/notify/build-event.test.ts` (full)
- Modify: `packages/server/src/ctx.ts:20-41`
- Modify: `packages/server/src/server.ts:21-42, 87`
- Modify: `packages/server/src/use-cases/create-thread.ts:48-51`
- Modify: `packages/server/src/use-cases/add-comment.ts:32-35`

- [ ] **Step 1: Update the build-event test to expect `threadUrl`**

Replace `packages/server/src/notify/build-event.test.ts` in full:

```typescript
import type { AuthorId, ThreadId } from '@airnauts/comments-core'
import { describe, expect, it } from 'vitest'
import { buildNotificationEvent } from './build-event'

const thread = { id: 't_1' as ThreadId, pageUrl: 'https://example.com/about', pageTitle: 'About' }
const comment = {
  text: 'Looks off here',
  author: { id: 'a_1' as AuthorId, email: 'alice@example.com', name: 'Alice' },
  createdAt: '2026-06-03T10:00:00.000Z',
}

describe('buildNotificationEvent', () => {
  it('maps thread + comment into a thread.created event with a deep-link', () => {
    const event = buildNotificationEvent(
      'thread.created',
      { projectId: 'proj_x' },
      thread,
      comment,
      'comments-thread',
    )
    expect(event).toEqual({
      type: 'thread.created',
      projectId: 'proj_x',
      threadId: 't_1',
      pageUrl: 'https://example.com/about',
      pageTitle: 'About',
      threadUrl: 'https://example.com/about?comments-thread=t_1',
      text: 'Looks off here',
      author: { email: 'alice@example.com', name: 'Alice' },
      createdAt: '2026-06-03T10:00:00.000Z',
    })
  })

  it('builds the deep-link with a custom param', () => {
    const event = buildNotificationEvent(
      'thread.created',
      { projectId: 'proj_x' },
      thread,
      comment,
      'c-thread',
    )
    expect(event.threadUrl).toBe('https://example.com/about?c-thread=t_1')
  })

  it('omits env, pageTitle and name when absent', () => {
    const event = buildNotificationEvent(
      'comment.added',
      { projectId: 'proj_x' },
      { id: 't_2' as ThreadId, pageUrl: 'https://example.com/' },
      { text: 'hi', author: { email: 'bob@example.com' }, createdAt: '2026-06-03T11:00:00.000Z' },
      'comments-thread',
    )
    expect(event.env).toBeUndefined()
    expect(event.pageTitle).toBeUndefined()
    expect(event.author.name).toBeUndefined()
    expect('name' in event.author).toBe(false)
  })

  it('includes env when the scope carries one', () => {
    const event = buildNotificationEvent(
      'thread.created',
      { projectId: 'proj_x', env: 'staging' },
      thread,
      comment,
      'comments-thread',
    )
    expect(event.env).toBe('staging')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @airnauts/comments-server test -- build-event`
Expected: FAIL — `buildNotificationEvent` takes 4 args / `threadUrl` missing from result.

- [ ] **Step 3: Add `threadUrl` to the event type**

In `packages/server/src/notify/types.ts`, add `threadUrl` after `pageTitle?` so the type reads:

```typescript
export type NotificationEvent = {
  type: NotificationEventType
  projectId: string
  env?: string
  threadId: ThreadId
  pageUrl: string
  pageTitle?: string
  threadUrl: string
  text: string
  author: { email: string; name?: string }
  createdAt: string // ISO
}
```

- [ ] **Step 4: Build the deep-link in build-event**

Replace `packages/server/src/notify/build-event.ts` in full:

```typescript
import { type Author, type ThreadId, threadLink } from '@airnauts/comments-core'
import type { NotificationEvent, NotificationEventType } from './types'

/**
 * Single source of the notification payload, shared by createThread and
 * addComment so the two event shapes cannot drift. The deep-link is built here
 * (not per notifier) from the server's configured threadParam. Optional fields
 * are added only when present (keeps the payload clean under
 * exactOptionalPropertyTypes).
 */
export function buildNotificationEvent(
  type: NotificationEventType,
  scope: { projectId: string; env?: string },
  thread: { id: ThreadId; pageUrl: string; pageTitle?: string },
  comment: { text: string; author: Author; createdAt: string },
  threadParam: string,
): NotificationEvent {
  const author: NotificationEvent['author'] = { email: comment.author.email }
  if (comment.author.name !== undefined) author.name = comment.author.name

  const event: NotificationEvent = {
    type,
    projectId: scope.projectId,
    threadId: thread.id,
    pageUrl: thread.pageUrl,
    threadUrl: threadLink(thread.pageUrl, thread.id, threadParam),
    text: comment.text,
    author,
    createdAt: comment.createdAt,
  }
  if (scope.env !== undefined) event.env = scope.env
  if (thread.pageTitle !== undefined) event.pageTitle = thread.pageTitle
  return event
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @airnauts/comments-server test -- build-event`
Expected: PASS (4 tests).

- [ ] **Step 6: Add `threadParam` to `Ctx`**

Replace lines 20-41 of `packages/server/src/ctx.ts` (the `Ctx`, `CtxInit`, `makeCtx` block) with:

```typescript
export type Ctx = {
  projectId: string
  env?: string
  threadParam: string
  now: () => Date
  ids: IdFactory
}

export type CtxInit = {
  projectId: string
  env?: string
  threadParam?: string
  now?: () => Date
  ids?: IdFactory
}

export function makeCtx(init: CtxInit): Ctx {
  return {
    projectId: init.projectId,
    env: init.env,
    threadParam: init.threadParam ?? DEFAULT_THREAD_PARAM,
    now: init.now ?? (() => new Date()),
    ids: init.ids ?? defaultIds(),
  }
}
```

And update the import on line 1 of `packages/server/src/ctx.ts` to pull the constant from core:

```typescript
import { type AttachmentId, type AuthorId, type CommentId, DEFAULT_THREAD_PARAM, type ThreadId } from '@airnauts/comments-core'
```

- [ ] **Step 7: Add the server option and thread it into the ctx**

In `packages/server/src/server.ts`, add the option to `CreateCommentsServerOptions` (after the `notifiers?` line, ~line 29):

```typescript
  /** Query param the widget reads to focus a thread; used to build notification deep-links. Defaults to "comments-thread". */
  threadParam?: string
```

Then change line 87 from:

```typescript
  const ctxBase: Ctx = makeCtx({ projectId: opts.projectId, env: opts.env, now, ids })
```

to:

```typescript
  const ctxBase: Ctx = makeCtx({
    projectId: opts.projectId,
    env: opts.env,
    threadParam: opts.threadParam,
    now,
    ids,
  })
```

- [ ] **Step 8: Pass `ctx.threadParam` from the use-cases**

In `packages/server/src/use-cases/create-thread.ts`, change lines 48-51 to:

```typescript
  await dispatchNotifications(
    deps.notifiers,
    buildNotificationEvent('thread.created', scope, thread, firstComment, ctx.threadParam),
  )
```

In `packages/server/src/use-cases/add-comment.ts`, change lines 32-35 to:

```typescript
  await dispatchNotifications(
    deps.notifiers,
    buildNotificationEvent('comment.added', scope, existing, saved, ctx.threadParam),
  )
```

- [ ] **Step 9: Run the full server suite + typecheck**

Run: `pnpm --filter @airnauts/comments-server test && pnpm --filter @airnauts/comments-server typecheck`
Expected: PASS. (Existing `makeCtx(...)` calls in other tests still compile because `CtxInit.threadParam` is optional.)

- [ ] **Step 10: Commit**

```bash
git add packages/server/src/notify/types.ts packages/server/src/notify/build-event.ts packages/server/src/notify/build-event.test.ts packages/server/src/ctx.ts packages/server/src/server.ts packages/server/src/use-cases/create-thread.ts packages/server/src/use-cases/add-comment.ts
git commit -m "feat(server): build thread deep-link once as event.threadUrl"
```

---

## Task 3: Slack notifier reads `event.threadUrl`

**Files:**
- Modify: `packages/notifier-slack/src/index.ts` (full)
- Modify: `packages/notifier-slack/src/index.test.ts` (full)

- [ ] **Step 1: Update the Slack tests (drop the custom-param case, add `threadUrl` to the fixture)**

Replace `packages/notifier-slack/src/index.test.ts` in full:

```typescript
import type { ThreadId } from '@airnauts/comments-core'
import type { NotificationEvent } from '@airnauts/comments-server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { formatSlackMessage, slackNotifier } from './index'

const event: NotificationEvent = {
  type: 'thread.created',
  projectId: 'proj_x',
  threadId: 't_1' as ThreadId,
  pageUrl: 'https://example.com/about',
  pageTitle: 'About',
  threadUrl: 'https://example.com/about?comments-thread=t_1',
  text: 'Looks off here',
  author: { email: 'alice@example.com', name: 'Alice' },
  createdAt: '2026-06-03T10:00:00.000Z',
}

afterEach(() => vi.unstubAllGlobals())

describe('slackNotifier', () => {
  it('POSTs a Block Kit message to the webhook URL', async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await slackNotifier({ webhookUrl: 'https://hooks.slack.com/services/T/B/x' }).notify(event)

    expect(fetchMock).toHaveBeenCalledOnce()
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://hooks.slack.com/services/T/B/x')
    expect(init.method).toBe('POST')
    const body = JSON.parse(init.body as string)
    expect(body.text).toContain('Alice')
    expect(body.text).toContain('Looks off here')
    expect(JSON.stringify(body.blocks)).toContain('https://example.com/about')
  })

  it('links to the thread deep-link, not the bare page', async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await slackNotifier({ webhookUrl: 'https://hooks.slack.com/x' }).notify(event)

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    const blocks = JSON.stringify(JSON.parse(init.body as string).blocks)
    expect(blocks).toContain('https://example.com/about?comments-thread=t_1')
  })

  it('exposes a stable name', () => {
    expect(slackNotifier({ webhookUrl: 'https://hooks.slack.com/x' }).name).toBe('slack')
  })

  it('throws on a non-2xx response without leaking the webhook URL', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('no', { status: 500 })),
    )
    const err = await slackNotifier({ webhookUrl: 'https://hooks.slack.com/secret-xyz' })
      .notify(event)
      .catch((e) => e as Error)
    expect(err).toBeInstanceOf(Error)
    expect(err.message).toMatch(/500/)
    expect(err.message).not.toContain('secret-xyz')
  })
})

describe('formatSlackMessage', () => {
  it('labels a new thread "New comment" and a reply "New reply"', () => {
    expect(formatSlackMessage(event).text).toContain('New comment')
    expect(formatSlackMessage({ ...event, type: 'comment.added' }).text).toContain('New reply')
  })

  it('falls back to the email when no name is present', () => {
    const msg = formatSlackMessage({ ...event, author: { email: 'bob@example.com' } })
    expect(msg.text).toContain('bob@example.com')
  })

  it('uses an image-comment fallback when the text is empty', () => {
    const msg = formatSlackMessage({ ...event, text: '' })
    expect(msg.text).toContain('(image comment)')
    expect(JSON.stringify(msg.blocks)).toContain('(image comment)')
  })

  it('links each block to the thread deep-link', () => {
    const blocks = JSON.stringify(formatSlackMessage(event).blocks)
    expect(blocks).toContain('https://example.com/about?comments-thread=t_1')
    expect(blocks).not.toContain('|https://example.com/about>') // never a bare page link
  })
})
```

- [ ] **Step 2: Run the updated tests to establish the baseline**

Run: `pnpm --filter @airnauts/comments-notifier-slack test`
Expected: PASS. This is a behavior-preserving refactor — the old source builds the same `…?comments-thread=t_1` link from `pageUrl`+`threadId` that the new fixture's `threadUrl` already contains, so the deep-link assertions pass before *and* after. The real change is removing the `threadParam` option (a type-level guarantee), verified by the typecheck in Step 4. The dropped `honours a custom thread param` test is intentionally gone.

- [ ] **Step 3: Simplify the Slack source to consume `event.threadUrl`**

Replace `packages/notifier-slack/src/index.ts` in full:

```typescript
import type { NotificationEvent, Notifier } from '@airnauts/comments-server'

export type SlackNotifierOptions = {
  /** Slack Incoming Webhook URL. The target channel is baked into this URL. */
  webhookUrl: string
}

/** Abort the webhook request after this many ms so a hung endpoint can't stall a write. */
const TIMEOUT_MS = 3000

export function slackNotifier(opts: SlackNotifierOptions): Notifier {
  return {
    name: 'slack',
    async notify(event: NotificationEvent): Promise<void> {
      const res = await fetch(opts.webhookUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(formatSlackMessage(event)),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      })
      if (!res.ok) {
        // Never include the webhook URL — it is a credential that ends up in logs.
        throw new Error(`slack webhook responded ${res.status}`)
      }
    },
  }
}

export type SlackMessage = {
  text: string
  blocks: unknown[]
}

/** Render a NotificationEvent as a Slack Block Kit message (with a plain-text fallback). */
export function formatSlackMessage(event: NotificationEvent): SlackMessage {
  const heading = event.type === 'comment.added' ? 'New reply' : 'New comment'
  const where = event.pageTitle ?? event.pageUrl
  const link = event.threadUrl
  const who = event.author.name
    ? `${event.author.name} (${event.author.email})`
    : event.author.email
  // Image-only comments are allowed (empty text + an attachment), so fall back to
  // a label rather than rendering an empty quote / dangling "by … :".
  const body = event.text.trim() === '' ? '(image comment)' : event.text
  const quoted = body.replace(/\n/g, '\n>')

  return {
    // Plain-text fallback for notifications / accessibility.
    text: `${heading} by ${who}: ${body}`,
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `:speech_balloon: *${heading}* · <${link}|${where}>`,
        },
      },
      {
        type: 'section',
        text: { type: 'mrkdwn', text: `>${quoted}` },
      },
      {
        type: 'context',
        elements: [{ type: 'mrkdwn', text: `${who} · <${link}|Open thread>` }],
      },
    ],
  }
}
```

- [ ] **Step 4: Run tests + typecheck to verify the option is gone**

Run: `pnpm --filter @airnauts/comments-server build && pnpm --filter @airnauts/comments-notifier-slack test && pnpm --filter @airnauts/comments-notifier-slack typecheck`
Expected: PASS — all `slackNotifier` + `formatSlackMessage` tests green, and the typecheck confirms no lingering references to the removed `threadParam`/`FormatOptions`.

- [ ] **Step 5: Commit**

```bash
git add packages/notifier-slack/src/index.ts packages/notifier-slack/src/index.test.ts
git commit -m "refactor(notifier-slack): use server-built event.threadUrl

BREAKING: removes the threadParam option from SlackNotifierOptions."
```

---

## Task 4: Scaffold `@airnauts/comments-notifier-email` + the format module

**Files:**
- Create: `packages/notifier-email/package.json`
- Create: `packages/notifier-email/tsconfig.json`
- Create: `packages/notifier-email/tsup.config.ts`
- Create: `packages/notifier-email/vitest.config.ts`
- Create: `packages/notifier-email/LICENSE`
- Create: `packages/notifier-email/src/format.ts`
- Create: `packages/notifier-email/src/format.test.ts`

- [ ] **Step 1: Create the package manifest**

Create `packages/notifier-email/package.json`:

```json
{
  "name": "@airnauts/comments-notifier-email",
  "version": "0.5.0",
  "description": "Email notifier (SMTP + Resend) for the Airnauts commenting tool server.",
  "keywords": [
    "comments",
    "commenting",
    "annotations",
    "feedback",
    "airnauts",
    "notifications",
    "email",
    "smtp",
    "resend"
  ],
  "license": "MIT",
  "author": "Airnauts",
  "homepage": "https://github.com/Airnauts/commenting-tool#readme",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/Airnauts/commenting-tool.git",
    "directory": "packages/notifier-email"
  },
  "bugs": {
    "url": "https://github.com/Airnauts/commenting-tool/issues"
  },
  "type": "module",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    },
    "./smtp": {
      "types": "./dist/smtp.d.ts",
      "import": "./dist/smtp.js"
    },
    "./resend": {
      "types": "./dist/resend.d.ts",
      "import": "./dist/resend.js"
    }
  },
  "files": [
    "dist",
    "!dist/.tsbuildinfo",
    "README.md",
    "LICENSE"
  ],
  "publishConfig": {
    "access": "public"
  },
  "scripts": {
    "build": "tsup && tsc --build --force",
    "typecheck": "tsc --build",
    "test": "vitest run"
  },
  "dependencies": {
    "@airnauts/comments-core": "workspace:^",
    "@airnauts/comments-server": "workspace:^"
  },
  "peerDependencies": {
    "nodemailer": ">=6"
  },
  "peerDependenciesMeta": {
    "nodemailer": {
      "optional": true
    }
  },
  "devDependencies": {
    "@airnauts/comments-test-support": "workspace:*",
    "@types/nodemailer": "^6.4.0",
    "nodemailer": "^6.9.0"
  }
}
```

- [ ] **Step 2: Create the build/test config files**

Create `packages/notifier-email/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist",
    "emitDeclarationOnly": true,
    "tsBuildInfoFile": "dist/.tsbuildinfo"
  },
  "include": ["src/**/*"],
  "exclude": ["dist", "node_modules", "src/**/*.test.ts"],
  "references": [{ "path": "../core" }, { "path": "../server" }]
}
```

Create `packages/notifier-email/tsup.config.ts`:

```typescript
import { defineConfig } from 'tsup'

export default defineConfig({
  entry: { index: 'src/index.ts', smtp: 'src/smtp.ts', resend: 'src/resend.ts' },
  format: ['esm'],
  dts: false,
  sourcemap: true,
  outDir: 'dist',
  // tsup's clean does NOT delete dist/.tsbuildinfo, so declaration re-emit is
  // forced by `tsc --build --force` in package.json, not by this clean (ADR-0023).
  clean: true,
})
```

Create `packages/notifier-email/vitest.config.ts`:

```typescript
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    name: 'notifier-email',
    environment: 'node',
  },
})
```

Create `packages/notifier-email/LICENSE`:

```
MIT License

Copyright (c) 2026 Airnauts

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

- [ ] **Step 3: Install so the workspace links the new package + nodemailer**

Run: `pnpm install`
Expected: lockfile updates; `@airnauts/comments-notifier-email` linked; `nodemailer` + `@types/nodemailer` installed.

- [ ] **Step 4: Write the failing format test**

Create `packages/notifier-email/src/format.test.ts`:

```typescript
import type { ThreadId } from '@airnauts/comments-core'
import type { NotificationEvent } from '@airnauts/comments-server'
import { describe, expect, it } from 'vitest'
import { escapeHtml, formatEmail } from './format'

const event: NotificationEvent = {
  type: 'thread.created',
  projectId: 'proj_x',
  threadId: 't_1' as ThreadId,
  pageUrl: 'https://example.com/about',
  pageTitle: 'About',
  threadUrl: 'https://example.com/about?comments-thread=t_1',
  text: 'Looks off here',
  author: { email: 'alice@example.com', name: 'Alice' },
  createdAt: '2026-06-03T10:00:00.000Z',
}

describe('escapeHtml', () => {
  it('escapes the five significant characters', () => {
    expect(escapeHtml(`<b>"x" & 'y'</b>`)).toBe('&lt;b&gt;&quot;x&quot; &amp; &#39;y&#39;&lt;/b&gt;')
  })
})

describe('formatEmail', () => {
  it('subjects a new thread "New comment on <where>"', () => {
    expect(formatEmail(event).subject).toBe('New comment on About')
  })

  it('subjects a reply "New reply on <where>"', () => {
    expect(formatEmail({ ...event, type: 'comment.added' }).subject).toBe('New reply on About')
  })

  it('applies a subject prefix', () => {
    expect(formatEmail(event, { subjectPrefix: '[Acme] ' }).subject).toBe('[Acme] New comment on About')
  })

  it('falls back to the page URL when there is no title', () => {
    const { pageTitle: _drop, ...noTitle } = event
    expect(formatEmail(noTitle as NotificationEvent).subject).toBe(
      'New comment on https://example.com/about',
    )
  })

  it('links both parts to the deep-link', () => {
    const out = formatEmail(event)
    expect(out.text).toContain('https://example.com/about?comments-thread=t_1')
    expect(out.html).toContain('href="https://example.com/about?comments-thread=t_1"')
  })

  it('escapes user-controlled text and author name in the HTML part', () => {
    const out = formatEmail({
      ...event,
      text: '<script>alert(1)</script>',
      author: { email: 'a@b.com', name: 'A<b>' },
    })
    expect(out.html).not.toContain('<script>')
    expect(out.html).toContain('&lt;script&gt;')
    expect(out.html).toContain('A&lt;b&gt;')
  })

  it('uses an image-comment fallback when the text is empty', () => {
    const out = formatEmail({ ...event, text: '' })
    expect(out.text).toContain('(image comment)')
    expect(out.html).toContain('(image comment)')
  })

  it('falls back to the email when no name is present', () => {
    const out = formatEmail({ ...event, author: { email: 'bob@example.com' } })
    expect(out.text).toContain('bob@example.com')
  })
})
```

- [ ] **Step 5: Run test to verify it fails**

Run: `pnpm --filter @airnauts/comments-notifier-email test -- format`
Expected: FAIL — `Cannot find module './format'`.

- [ ] **Step 6: Implement the format module**

Create `packages/notifier-email/src/format.ts`:

```typescript
import type { NotificationEvent } from '@airnauts/comments-server'

export type EmailFormat = { subject: string; html: string; text: string }
export type FormatEmailOptions = { subjectPrefix?: string }

/** Escape the five characters that are significant in HTML text/attribute context. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** Render a NotificationEvent as a subject + HTML + plain-text multipart body. */
export function formatEmail(event: NotificationEvent, opts: FormatEmailOptions = {}): EmailFormat {
  const heading = event.type === 'comment.added' ? 'New reply' : 'New comment'
  const where = event.pageTitle ?? event.pageUrl
  const who = event.author.name
    ? `${event.author.name} (${event.author.email})`
    : event.author.email
  // Image-only comments are allowed (empty text + an attachment).
  const body = event.text.trim() === '' ? '(image comment)' : event.text
  const subject = `${opts.subjectPrefix ?? ''}${heading} on ${where}`

  const text = `${heading} by ${who}\n\n${body}\n\nView thread: ${event.threadUrl}`

  const html = [
    `<p><strong>${escapeHtml(heading)}</strong> on ${escapeHtml(where)}</p>`,
    `<p>${escapeHtml(who)} wrote:</p>`,
    `<blockquote>${escapeHtml(body).replace(/\n/g, '<br>')}</blockquote>`,
    `<p><a href="${escapeHtml(event.threadUrl)}">View thread</a></p>`,
  ].join('\n')

  return { subject, html, text }
}
```

- [ ] **Step 7: Run test to verify it passes**

Run: `pnpm --filter @airnauts/comments-notifier-email test -- format`
Expected: PASS (10 tests).

- [ ] **Step 8: Commit**

```bash
git add packages/notifier-email/package.json packages/notifier-email/tsconfig.json packages/notifier-email/tsup.config.ts packages/notifier-email/vitest.config.ts packages/notifier-email/LICENSE packages/notifier-email/src/format.ts packages/notifier-email/src/format.test.ts pnpm-lock.yaml
git commit -m "feat(notifier-email): scaffold package + email format module"
```

---

## Task 5: `emailNotifier` factory (against a fake transport)

**Files:**
- Create: `packages/notifier-email/src/index.ts`
- Create: `packages/notifier-email/src/index.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/notifier-email/src/index.test.ts`:

```typescript
import type { ThreadId } from '@airnauts/comments-core'
import type { NotificationEvent } from '@airnauts/comments-server'
import { describe, expect, it } from 'vitest'
import { type EmailMessage, type EmailTransport, emailNotifier } from './index'

const event: NotificationEvent = {
  type: 'thread.created',
  projectId: 'proj_x',
  threadId: 't_1' as ThreadId,
  pageUrl: 'https://example.com/about',
  pageTitle: 'About',
  threadUrl: 'https://example.com/about?comments-thread=t_1',
  text: 'Looks off here',
  author: { email: 'alice@example.com', name: 'Alice' },
  createdAt: '2026-06-03T10:00:00.000Z',
}

/** Records the last message it was asked to send. */
function fakeTransport(): EmailTransport & { sent: EmailMessage[] } {
  const sent: EmailMessage[] = []
  return { name: 'fake', sent, async send(message) { sent.push(message) } }
}

describe('emailNotifier', () => {
  it('exposes a stable name', () => {
    expect(emailNotifier({ transport: fakeTransport(), to: ['a@b.com'], from: 'c@d.com' }).name).toBe(
      'email',
    )
  })

  it('addresses a single recipient in "to"', async () => {
    const transport = fakeTransport()
    await emailNotifier({ transport, to: ['solo@b.com'], from: 'noreply@d.com' }).notify(event)
    const msg = transport.sent[0]!
    expect(msg.to).toEqual(['solo@b.com'])
    expect(msg.bcc).toBeUndefined()
    expect(msg.from).toBe('noreply@d.com')
  })

  it('bcc-fans multiple recipients and puts the sender in "to"', async () => {
    const transport = fakeTransport()
    await emailNotifier({
      transport,
      to: ['x@b.com', 'y@b.com'],
      from: 'noreply@d.com',
    }).notify(event)
    const msg = transport.sent[0]!
    expect(msg.to).toEqual(['noreply@d.com'])
    expect(msg.bcc).toEqual(['x@b.com', 'y@b.com'])
  })

  it('passes the rendered subject/html/text through', async () => {
    const transport = fakeTransport()
    await emailNotifier({
      transport,
      to: ['a@b.com'],
      from: 'c@d.com',
      subjectPrefix: '[Acme] ',
    }).notify(event)
    const msg = transport.sent[0]!
    expect(msg.subject).toBe('[Acme] New comment on About')
    expect(msg.html).toContain('href="https://example.com/about?comments-thread=t_1"')
    expect(msg.text).toContain('Looks off here')
  })

  it('sets reply-to only when provided', async () => {
    const withReply = fakeTransport()
    await emailNotifier({
      transport: withReply,
      to: ['a@b.com'],
      from: 'c@d.com',
      replyTo: 'team@d.com',
    }).notify(event)
    expect(withReply.sent[0]!.replyTo).toBe('team@d.com')

    const without = fakeTransport()
    await emailNotifier({ transport: without, to: ['a@b.com'], from: 'c@d.com' }).notify(event)
    expect(without.sent[0]!.replyTo).toBeUndefined()
  })

  it('propagates a transport failure (dispatch isolates it upstream)', async () => {
    const boom: EmailTransport = {
      name: 'boom',
      async send() {
        throw new Error('smtp 550')
      },
    }
    await expect(
      emailNotifier({ transport: boom, to: ['a@b.com'], from: 'c@d.com' }).notify(event),
    ).rejects.toThrow('smtp 550')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @airnauts/comments-notifier-email test -- index`
Expected: FAIL — `Cannot find module './index'`.

- [ ] **Step 3: Implement the factory + port types**

Create `packages/notifier-email/src/index.ts`:

```typescript
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
  /** Static recipient list. */
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

export { escapeHtml, formatEmail } from './format'
export type { EmailFormat, FormatEmailOptions } from './format'
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @airnauts/comments-notifier-email test -- index`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/notifier-email/src/index.ts packages/notifier-email/src/index.test.ts
git commit -m "feat(notifier-email): emailNotifier factory + transport port"
```

---

## Task 6: Resend transport (mock `fetch`)

**Files:**
- Create: `packages/notifier-email/src/resend.ts`
- Create: `packages/notifier-email/src/resend.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/notifier-email/src/resend.test.ts`:

```typescript
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { EmailMessage } from './index'
import { resendTransport } from './resend'

const message: EmailMessage = {
  to: ['noreply@d.com'],
  bcc: ['x@b.com', 'y@b.com'],
  from: 'noreply@d.com',
  replyTo: 'team@d.com',
  subject: 'New comment on About',
  html: '<p>hi</p>',
  text: 'hi',
}

afterEach(() => vi.unstubAllGlobals())

describe('resendTransport', () => {
  it('exposes a stable name', () => {
    expect(resendTransport({ apiKey: 'k' }).name).toBe('resend')
  })

  it('POSTs the message to the Resend API with a bearer token', async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await resendTransport({ apiKey: 'secret-key' }).send(message)

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://api.resend.com/emails')
    expect(init.method).toBe('POST')
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer secret-key')
    const body = JSON.parse(init.body as string)
    expect(body.from).toBe('noreply@d.com')
    expect(body.to).toEqual(['noreply@d.com'])
    expect(body.bcc).toEqual(['x@b.com', 'y@b.com'])
    expect(body.reply_to).toBe('team@d.com')
    expect(body.subject).toBe('New comment on About')
    expect(body.html).toBe('<p>hi</p>')
    expect(body.text).toBe('hi')
  })

  it('omits bcc/reply_to when not set', async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await resendTransport({ apiKey: 'k' }).send({
      to: ['a@b.com'],
      from: 'c@d.com',
      subject: 's',
      html: 'h',
      text: 't',
    })

    const body = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string)
    expect('bcc' in body).toBe(false)
    expect('reply_to' in body).toBe(false)
  })

  it('throws on a non-2xx response without leaking the api key', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('no', { status: 422 })),
    )
    const err = await resendTransport({ apiKey: 'secret-key' })
      .send(message)
      .catch((e) => e as Error)
    expect(err).toBeInstanceOf(Error)
    expect(err.message).toMatch(/422/)
    expect(err.message).not.toContain('secret-key')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @airnauts/comments-notifier-email test -- resend`
Expected: FAIL — `Cannot find module './resend'`.

- [ ] **Step 3: Implement the Resend transport**

Create `packages/notifier-email/src/resend.ts`:

```typescript
import type { EmailMessage, EmailTransport } from './index'

export type ResendTransportOptions = {
  /** Resend API key (https://resend.com/api-keys). */
  apiKey: string
}

const RESEND_ENDPOINT = 'https://api.resend.com/emails'

/** Abort the request after this many ms so a hung endpoint can't stall a write. */
const TIMEOUT_MS = 5000

export function resendTransport(opts: ResendTransportOptions): EmailTransport {
  return {
    name: 'resend',
    async send(message: EmailMessage): Promise<void> {
      const payload: Record<string, unknown> = {
        from: message.from,
        to: message.to,
        subject: message.subject,
        html: message.html,
        text: message.text,
      }
      if (message.bcc !== undefined) payload.bcc = message.bcc
      if (message.replyTo !== undefined) payload.reply_to = message.replyTo

      const res = await fetch(RESEND_ENDPOINT, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${opts.apiKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      })
      if (!res.ok) {
        // Never include the api key — it is a credential that ends up in logs.
        throw new Error(`resend api responded ${res.status}`)
      }
    },
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @airnauts/comments-notifier-email test -- resend`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/notifier-email/src/resend.ts packages/notifier-email/src/resend.test.ts
git commit -m "feat(notifier-email): Resend HTTP transport"
```

---

## Task 7: SMTP transport (mock nodemailer)

**Files:**
- Create: `packages/notifier-email/src/smtp.ts`
- Create: `packages/notifier-email/src/smtp.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/notifier-email/src/smtp.test.ts`:

```typescript
import { beforeEach, describe, expect, it, vi } from 'vitest'

const sendMail = vi.fn(async () => ({ messageId: 'x' }))
const createTransport = vi.fn(() => ({ sendMail }))

// Mock the nodemailer default export the transport imports.
vi.mock('nodemailer', () => ({ default: { createTransport } }))

import type { EmailMessage } from './index'
import { smtpTransport } from './smtp'

const message: EmailMessage = {
  to: ['noreply@d.com'],
  bcc: ['x@b.com', 'y@b.com'],
  from: 'noreply@d.com',
  replyTo: 'team@d.com',
  subject: 'New comment on About',
  html: '<p>hi</p>',
  text: 'hi',
}

beforeEach(() => {
  sendMail.mockClear()
  createTransport.mockClear()
})

describe('smtpTransport', () => {
  it('exposes a stable name', () => {
    expect(smtpTransport({ host: 'h', port: 587, auth: { user: 'u', pass: 'p' } }).name).toBe('smtp')
  })

  it('creates one transporter from the connection options', () => {
    smtpTransport({ host: 'smtp.example.com', port: 465, secure: true, auth: { user: 'u', pass: 'p' } })
    expect(createTransport).toHaveBeenCalledWith({
      host: 'smtp.example.com',
      port: 465,
      secure: true,
      auth: { user: 'u', pass: 'p' },
      pool: undefined,
    })
  })

  it('maps an EmailMessage onto sendMail', async () => {
    await smtpTransport({ host: 'h', port: 587, auth: { user: 'u', pass: 'p' } }).send(message)
    expect(sendMail).toHaveBeenCalledWith({
      from: 'noreply@d.com',
      to: ['noreply@d.com'],
      bcc: ['x@b.com', 'y@b.com'],
      replyTo: 'team@d.com',
      subject: 'New comment on About',
      html: '<p>hi</p>',
      text: 'hi',
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @airnauts/comments-notifier-email test -- smtp`
Expected: FAIL — `Cannot find module './smtp'`.

- [ ] **Step 3: Implement the SMTP transport**

Create `packages/notifier-email/src/smtp.ts`:

```typescript
import nodemailer from 'nodemailer'
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
  const transporter = nodemailer.createTransport({
    host: opts.host,
    port: opts.port,
    secure: opts.secure ?? false,
    auth: { user: opts.auth.user, pass: opts.auth.pass },
    pool: opts.pool,
  })
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @airnauts/comments-notifier-email test -- smtp`
Expected: PASS (3 tests).

- [ ] **Step 5: Build the package (verifies the 3 entry points + .d.ts emit) and lint**

Run: `pnpm --filter @airnauts/comments-notifier-email build && pnpm lint`
Expected: `dist/index.js`, `dist/smtp.js`, `dist/resend.js` and matching `.d.ts` files emitted; biome clean.

- [ ] **Step 6: Commit**

```bash
git add packages/notifier-email/src/smtp.ts packages/notifier-email/src/smtp.test.ts
git commit -m "feat(notifier-email): SMTP (nodemailer) transport"
```

---

## Task 8: README, changesets, ADRs, release wiring

**Files:**
- Create: `packages/notifier-email/README.md`
- Modify: `.changeset/config.json` (add the package to the fixed group)
- Create: `.changeset/email-notifier.md`
- Create: `.changeset/server-thread-url.md`
- Create: `.changeset/core-deep-link.md`
- Create: `.changeset/slack-thread-url.md`
- Modify: `docs/adr.md` (append ADR-0031, ADR-0032)

- [ ] **Step 1: Write the package README**

Create `packages/notifier-email/README.md`:

````markdown
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
````

- [ ] **Step 2: Add the package to the Changesets fixed group**

In `.changeset/config.json`, add `"@airnauts/comments-notifier-email"` to the `fixed` array (alphabetical, after `@airnauts/comments-notifier-slack`). The `fixed` array becomes:

```json
  "fixed": [
    [
      "@airnauts/comments-adapter-memory",
      "@airnauts/comments-adapter-mongo",
      "@airnauts/comments-client",
      "@airnauts/comments-core",
      "@airnauts/comments-next",
      "@airnauts/comments-notifier-email",
      "@airnauts/comments-notifier-slack",
      "@airnauts/comments-server",
      "@airnauts/comments-storage-fs",
      "@airnauts/comments-storage-vercel-blob"
    ]
  ],
```

- [ ] **Step 3: Write the changesets**

Create `.changeset/email-notifier.md`:

```markdown
---
"@airnauts/comments-notifier-email": minor
---

New package: email notifications. `emailNotifier({ transport, to, from })` emails a fixed
recipient list on new comments and replies. Ships SMTP (`/smtp`, via the optional `nodemailer`
peer) and Resend (`/resend`, fetch-based) transports, and exports an `EmailTransport` port so you
can plug in any provider.
```

Create `.changeset/server-thread-url.md`:

```markdown
---
"@airnauts/comments-server": minor
---

Notification events now carry a ready-made `threadUrl` deep-link, built by the server from a new
optional `threadParam` option on `createCommentsServer` (defaults to `comments-thread`). Notifiers
no longer build the link themselves.
```

Create `.changeset/core-deep-link.md`:

```markdown
---
"@airnauts/comments-core": minor
---

Export `threadLink()` and `DEFAULT_THREAD_PARAM` — the single source of truth for thread
deep-link URLs, shared by the widget and server-side notifiers.
```

Create `.changeset/slack-thread-url.md`:

```markdown
---
"@airnauts/comments-notifier-slack": minor
---

The Slack notifier now uses the deep-link built by the server. The `threadParam` option has been
removed from `slackNotifier(...)`; set `threadParam` on `createCommentsServer` instead if you have
customized the widget's thread param.
```

- [ ] **Step 4: Append the ADRs**

Append to `docs/adr.md` (after the last record):

```markdown
## ADR-0031 — Server owns the thread deep-link

**Date:** 2026-06-08. **Status:** accepted.

**Context.** The thread deep-link (`pageUrl?comments-thread=<id>`) is a contract between the
widget (reads the param to focus a thread) and notifiers (write it). The Slack notifier
re-declared its own `DEFAULT_THREAD_PARAM` and `threadParam` option, duplicating the client's
constant with nothing enforcing they match; each new channel would copy it again.

**Decision.** Move `DEFAULT_THREAD_PARAM` and `threadLink()` into `@airnauts/comments-core` as the
single source of truth. `createCommentsServer` gains an optional `threadParam` (default from core),
carried on `Ctx`; `buildNotificationEvent` builds the full link once and adds `threadUrl` to
`NotificationEvent`. Notifiers read `event.threadUrl` and never construct links. The widget and
server defaults both come from the core constant, so the zero-config case agrees automatically.

**Consequences.** Removing `threadParam` from `SlackNotifierOptions` is breaking (pre-1.0 → minor).
`NotificationEvent` carries one more field. A host that renames the param sets it in two places
(widget + server), never per-notifier. Supersedes the per-notifier link handling introduced in
ADR-0029.

## ADR-0032 — Email notifier with a pluggable transport port

**Date:** 2026-06-08. **Status:** accepted.

**Context.** Email is the second notification channel (after Slack, ADR-0029). Unlike a Slack
webhook (destination baked into the URL), email needs an explicit recipient list and a sender, and
hosts run on different providers and runtimes (Node servers vs. serverless/edge).

**Decision.** Ship `@airnauts/comments-notifier-email`: `emailNotifier({ transport, to, from, … })`
implements the `Notifier` port and delegates delivery to an injected `EmailTransport` port. Two
built-in transports as subpath exports — `/smtp` (nodemailer, optional peer dep) and `/resend`
(fetch) — keep the package root dependency-free; any provider can be added by implementing the
port. Recipients are a static list (single → `to`; multiple → `bcc` for privacy). Bodies are
HTML + plain-text multipart with HTML-escaped user content.

**Consequences.** `nodemailer` is CJS/Node-only — the SMTP transport will not run on edge; Resend
will. Under ADR-0029 (dispatch awaited in-request to survive serverless freeze), the SMTP
connection handshake adds more comment-POST latency than the HTTP-based Slack/Resend channels.
Dynamic/participant recipients, mention events, and host-overridable templates are deferred; the
ports accommodate them later with no core change.
```

- [ ] **Step 5: Full verification across the affected packages**

Run:

```bash
pnpm --filter @airnauts/comments-core build
pnpm --filter @airnauts/comments-server build
pnpm --filter @airnauts/comments-notifier-slack build
pnpm --filter @airnauts/comments-notifier-email build
pnpm --filter @airnauts/comments-core test
pnpm --filter @airnauts/comments-client test
pnpm --filter @airnauts/comments-server test
pnpm --filter @airnauts/comments-notifier-slack test
pnpm --filter @airnauts/comments-notifier-email test
pnpm lint
```

Expected: all builds emit, all suites PASS, biome clean.

- [ ] **Step 6: Commit**

```bash
git add packages/notifier-email/README.md .changeset/config.json .changeset/email-notifier.md .changeset/server-thread-url.md .changeset/core-deep-link.md .changeset/slack-thread-url.md docs/adr.md
git commit -m "docs(notifier-email): README, changesets, ADR-0031/0032"
```

---

## Verification checklist (whole feature)

- [ ] `core` exports `threadLink` + `DEFAULT_THREAD_PARAM`; client re-exports them; client tests green.
- [ ] `NotificationEvent.threadUrl` is populated by `buildNotificationEvent` using the server's `threadParam`.
- [ ] Slack notifier compiles without `threadParam`; deep-link assertions use `event.threadUrl`.
- [ ] `@airnauts/comments-notifier-email` builds three entry points (`index`, `smtp`, `resend`) with `.d.ts`.
- [ ] `emailNotifier` single→`to`, multi→`bcc`, optional `replyTo`, prefix subject; HTML-escapes user content.
- [ ] `resendTransport` POSTs to the API, omits absent fields, never leaks the key on error.
- [ ] `smtpTransport` builds one transporter and maps onto `sendMail`.
- [ ] Package in the Changesets fixed group; four changesets present; ADR-0031/0032 appended.
- [ ] `pnpm lint` clean.
```
