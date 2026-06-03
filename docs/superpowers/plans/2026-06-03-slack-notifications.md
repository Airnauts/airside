# Slack Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Send a Slack message — author, comment text, page link — whenever a reviewer creates a thread or replies, via a generic notification seam with Slack as the first concrete.

**Architecture:** A new `Notifier` output port lives in `@airnauts/comments-server` alongside `Repository`/`StorageAdapter`. The `createThread` / `addComment` use cases build a `NotificationEvent` after a successful write and fan it out with `dispatchNotifications` (`Promise.allSettled`, failures swallowed). A new publishable package `@airnauts/comments-notifier-slack` posts Block Kit JSON to a Slack Incoming Webhook, bounded by a 3 s timeout. The webhook URL is the only credential.

**Tech Stack:** TypeScript (ESM), pnpm workspaces, tsup + `tsc --build --force`, Vitest, Slack Incoming Webhooks / Block Kit.

**Reference spec:** `docs/superpowers/specs/2026-06-03-slack-notifications-design.md`

**Conventions:** Backend is TDD (ADR-0010) — failing test first. Commit after each green step. Run a single package's tests with `pnpm --filter <pkg> test`. All paths are relative to the repo root.

---

## File structure

**New — server seam (`packages/server/src/notify/`):**
- `types.ts` — `NotificationEvent`, `NotificationEventType`, `Notifier`.
- `build-event.ts` — `buildNotificationEvent(...)` shared by both use cases.
- `dispatch.ts` — `dispatchNotifications(...)` (allSettled, failure-isolated).
- `build-event.test.ts`, `dispatch.test.ts`.

**Modified — server:**
- `src/use-cases/create-thread.ts` — add `notifiers?` dep + dispatch.
- `src/use-cases/add-comment.ts` — add `notifiers?` dep + dispatch.
- `src/use-cases/create-thread.test.ts`, `src/use-cases/add-comment.test.ts` — new notify assertions.
- `src/server.ts` — `notifiers?` option, passed into both use-case deps.
- `src/index.ts` — export the seam types.

**New — Slack package (`packages/notifier-slack/`):**
- `package.json`, `tsconfig.json`, `tsup.config.ts`, `vitest.config.ts`, `README.md`, `LICENSE`.
- `src/index.ts` — `slackNotifier(...)`, `formatSlackMessage(...)`.
- `src/index.test.ts`.

**Modified — wiring & docs:**
- `tsconfig.json` (root) — add `packages/notifier-slack` reference.
- `examples/nextjs-host/app/api/comments/[...path]/route.ts` + `examples/nextjs-host/package.json` — env-gated Slack notifier.
- `docs/adr.md` — ADR-0029.
- `docs/architecture.md` — §2/§4 mention the seam.
- `docs/integration.md` — Slack section.
- `.changeset/slack-notifications.md`.

---

## Task 1: Notifier seam types

**Files:**
- Create: `packages/server/src/notify/types.ts`
- Modify: `packages/server/src/index.ts`

- [ ] **Step 1: Create the seam types**

`packages/server/src/notify/types.ts`:

```ts
import type { ThreadId } from '@airnauts/comments-core'

export type NotificationEventType = 'thread.created' | 'comment.added'

/** Transport-agnostic payload handed to every Notifier. */
export type NotificationEvent = {
  type: NotificationEventType
  projectId: string
  env?: string
  threadId: ThreadId
  pageUrl: string
  pageTitle?: string
  text: string
  author: { email: string; name?: string }
  createdAt: string // ISO
}

/** Outbound port: one per delivery channel (Slack, email, …). */
export interface Notifier {
  /** Human-readable id used only for logging on failure (never log credentials). */
  readonly name: string
  notify(event: NotificationEvent): Promise<void>
}
```

- [ ] **Step 2: Export the types from the server index**

In `packages/server/src/index.ts`, after the `StorageAdapter` export line
(`export type { PutBlob, PutResult, StorageAdapter } from './storage/types'`), add:

```ts
export type { NotificationEvent, NotificationEventType, Notifier } from './notify/types'
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @airnauts/comments-server typecheck`
Expected: PASS (no implementation references these types yet).

- [ ] **Step 4: Commit**

```bash
git add packages/server/src/notify/types.ts packages/server/src/index.ts
git commit -m "feat(server): add Notifier seam types"
```

---

## Task 2: buildNotificationEvent helper

**Files:**
- Create: `packages/server/src/notify/build-event.ts`
- Test: `packages/server/src/notify/build-event.test.ts`

- [ ] **Step 1: Write the failing test**

`packages/server/src/notify/build-event.test.ts`:

```ts
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
  it('maps thread + comment into a thread.created event', () => {
    const event = buildNotificationEvent('thread.created', { projectId: 'proj_x' }, thread, comment)
    expect(event).toEqual({
      type: 'thread.created',
      projectId: 'proj_x',
      threadId: 't_1',
      pageUrl: 'https://example.com/about',
      pageTitle: 'About',
      text: 'Looks off here',
      author: { email: 'alice@example.com', name: 'Alice' },
      createdAt: '2026-06-03T10:00:00.000Z',
    })
  })

  it('omits env, pageTitle and name when absent', () => {
    const event = buildNotificationEvent(
      'comment.added',
      { projectId: 'proj_x' },
      { id: 't_2' as ThreadId, pageUrl: 'https://example.com/' },
      { text: 'hi', author: { email: 'bob@example.com' }, createdAt: '2026-06-03T11:00:00.000Z' },
    )
    expect(event.env).toBeUndefined()
    expect(event.pageTitle).toBeUndefined()
    expect(event.author.name).toBeUndefined()
    expect('name' in event.author).toBe(false)
  })

  it('includes env when the scope carries one', () => {
    const event = buildNotificationEvent('thread.created', { projectId: 'proj_x', env: 'staging' }, thread, comment)
    expect(event.env).toBe('staging')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @airnauts/comments-server test build-event`
Expected: FAIL — cannot find module `./build-event`.

- [ ] **Step 3: Write the implementation**

`packages/server/src/notify/build-event.ts`:

```ts
import type { Author, ThreadId } from '@airnauts/comments-core'
import type { NotificationEvent, NotificationEventType } from './types'

/**
 * Single source of the notification payload, shared by createThread and
 * addComment so the two event shapes cannot drift. Optional fields are added
 * only when present (keeps the payload clean under exactOptionalPropertyTypes).
 */
export function buildNotificationEvent(
  type: NotificationEventType,
  scope: { projectId: string; env?: string },
  thread: { id: ThreadId; pageUrl: string; pageTitle?: string },
  comment: { text: string; author: Author; createdAt: string },
): NotificationEvent {
  const author: NotificationEvent['author'] = { email: comment.author.email }
  if (comment.author.name !== undefined) author.name = comment.author.name

  const event: NotificationEvent = {
    type,
    projectId: scope.projectId,
    threadId: thread.id,
    pageUrl: thread.pageUrl,
    text: comment.text,
    author,
    createdAt: comment.createdAt,
  }
  if (scope.env !== undefined) event.env = scope.env
  if (thread.pageTitle !== undefined) event.pageTitle = thread.pageTitle
  return event
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @airnauts/comments-server test build-event`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/notify/build-event.ts packages/server/src/notify/build-event.test.ts
git commit -m "feat(server): add buildNotificationEvent helper"
```

---

## Task 3: dispatchNotifications

**Files:**
- Create: `packages/server/src/notify/dispatch.ts`
- Test: `packages/server/src/notify/dispatch.test.ts`

- [ ] **Step 1: Write the failing test**

`packages/server/src/notify/dispatch.test.ts`:

```ts
import type { ThreadId } from '@airnauts/comments-core'
import { describe, expect, it, vi } from 'vitest'
import { dispatchNotifications } from './dispatch'
import type { NotificationEvent, Notifier } from './types'

const event: NotificationEvent = {
  type: 'thread.created',
  projectId: 'proj_x',
  threadId: 't_1' as ThreadId,
  pageUrl: 'https://example.com/about',
  text: 'hi',
  author: { email: 'alice@example.com' },
  createdAt: '2026-06-03T10:00:00.000Z',
}

describe('dispatchNotifications', () => {
  it('calls notify on every notifier', async () => {
    const a: Notifier = { name: 'a', notify: vi.fn(async () => {}) }
    const b: Notifier = { name: 'b', notify: vi.fn(async () => {}) }
    await dispatchNotifications([a, b], event)
    expect(a.notify).toHaveBeenCalledWith(event)
    expect(b.notify).toHaveBeenCalledWith(event)
  })

  it('does not reject when a notifier throws, and still runs the others', async () => {
    const bad: Notifier = { name: 'bad', notify: vi.fn(async () => { throw new Error('boom') }) }
    const good: Notifier = { name: 'good', notify: vi.fn(async () => {}) }
    const log = vi.fn()
    await expect(dispatchNotifications([bad, good], event, log)).resolves.toBeUndefined()
    expect(good.notify).toHaveBeenCalled()
    expect(log).toHaveBeenCalledWith(expect.stringContaining('bad'))
  })

  it('is a no-op for empty or undefined notifiers', async () => {
    await expect(dispatchNotifications([], event)).resolves.toBeUndefined()
    await expect(dispatchNotifications(undefined, event)).resolves.toBeUndefined()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @airnauts/comments-server test notify/dispatch`
Expected: FAIL — cannot find module `./dispatch`.

- [ ] **Step 3: Write the implementation**

`packages/server/src/notify/dispatch.ts`:

```ts
import type { NotificationEvent, Notifier } from './types'

/**
 * Fan an event out to every notifier. Never rejects: a notifier that throws is
 * logged (name + reason) and swallowed, so a failed notification cannot break
 * the comment write. Awaited by the caller so the delivery is not dropped when a
 * serverless function freezes after the response.
 */
export async function dispatchNotifications(
  notifiers: readonly Notifier[] | undefined,
  event: NotificationEvent,
  log: (message: string) => void = (m) => console.error(m),
): Promise<void> {
  if (!notifiers || notifiers.length === 0) return
  const results = await Promise.allSettled(notifiers.map((n) => n.notify(event)))
  results.forEach((result, i) => {
    if (result.status === 'rejected') {
      const name = notifiers[i]?.name ?? 'unknown'
      log(`[comments] notifier "${name}" failed: ${String(result.reason)}`)
    }
  })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @airnauts/comments-server test notify/dispatch`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/notify/dispatch.ts packages/server/src/notify/dispatch.test.ts
git commit -m "feat(server): add failure-isolated notification dispatch"
```

---

## Task 4: Dispatch from createThread

**Files:**
- Modify: `packages/server/src/use-cases/create-thread.ts`
- Test: `packages/server/src/use-cases/create-thread.test.ts`

- [ ] **Step 1: Add the failing test**

Append this `it(...)` inside the existing `describe('createThread use-case', …)` block in
`packages/server/src/use-cases/create-thread.test.ts`. Also add `vi` to the vitest import
(`import { describe, expect, it, vi } from 'vitest'`) and add
`import type { Notifier } from '../notify/types'` to the imports.

```ts
  it('dispatches a thread.created notification to notifiers', async () => {
    const repo = new InMemoryRepository()
    const ctx = makeCtx({ projectId: 'proj_x' })
    const notify = vi.fn(async () => {})
    const notifier: Notifier = { name: 'spy', notify }
    const body = makeCreateThreadBody()
    await createThread({ ctx, params: undefined, query: undefined, body }, { repo, notifiers: [notifier] })
    expect(notify).toHaveBeenCalledOnce()
    const event = notify.mock.calls[0]![0]
    expect(event.type).toBe('thread.created')
    expect(event.text).toBe('first comment')
    expect(event.author.email).toBe('alice@example.com')
    expect(event.pageUrl).toBe('https://example.com/about')
    expect(event.pageTitle).toBe('About')
    expect(event.threadId).toBeDefined()
  })

  it('does not require notifiers (no-op when omitted)', async () => {
    const repo = new InMemoryRepository()
    const ctx = makeCtx({ projectId: 'proj_x' })
    const body = makeCreateThreadBody()
    const thread = await createThread({ ctx, params: undefined, query: undefined, body }, { repo })
    expect(thread.id).toBeDefined()
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @airnauts/comments-server test create-thread`
Expected: FAIL — `notifiers` is not assignable to `CreateThreadDeps` (and `notify` never called).

- [ ] **Step 3: Wire dispatch into the use case**

Edit `packages/server/src/use-cases/create-thread.ts`. Update the imports and deps type, then
dispatch after the repo write. Replace the file body so it reads:

```ts
import { ANCHOR_SCHEMA_VERSION, type CreateThreadBody, type Thread } from '@airnauts/comments-core'
import type { Ctx } from '../ctx'
import { buildNotificationEvent } from '../notify/build-event'
import { dispatchNotifications } from '../notify/dispatch'
import type { Notifier } from '../notify/types'
import type { Repository } from '../repository/types'
import { resolveAttachments } from './resolve-attachments'

export type CreateThreadDeps = { repo: Repository; notifiers?: Notifier[] }

export async function createThread(
  input: { ctx: Ctx; params: undefined; query: undefined; body: CreateThreadBody },
  deps: CreateThreadDeps,
): Promise<Thread> {
  const { ctx, body } = input
  const scope = { projectId: ctx.projectId, env: ctx.env }
  const nowIso = ctx.now().toISOString()
  const threadId = ctx.ids.thread()
  const commentId = ctx.ids.comment()
  const attachments = await resolveAttachments(deps.repo, scope, body.comment.attachmentIds)
  const firstComment = {
    id: commentId,
    author: body.author,
    text: body.comment.text,
    attachments,
    createdAt: nowIso,
  }
  const thread = await deps.repo.createThread({
    projectId: ctx.projectId,
    env: ctx.env,
    id: threadId,
    scope: 'page',
    pageKey: body.pageKey ?? null,
    pageUrl: body.pageUrl,
    pageTitle: body.pageTitle,
    anchor: body.anchor,
    status: 'open',
    anchorState: 'anchored',
    captureContext: body.captureContext,
    provenance: body.provenance,
    createdBy: body.author,
    createdAt: nowIso,
    updatedAt: nowIso,
    lastActivityAt: nowIso,
    schemaVersion: ANCHOR_SCHEMA_VERSION,
    firstComment,
  })
  await dispatchNotifications(
    deps.notifiers,
    buildNotificationEvent('thread.created', scope, thread, firstComment),
  )
  return thread
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @airnauts/comments-server test create-thread`
Expected: PASS (all existing tests plus the two new ones).

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/use-cases/create-thread.ts packages/server/src/use-cases/create-thread.test.ts
git commit -m "feat(server): notify on thread creation"
```

---

## Task 5: Dispatch from addComment

**Files:**
- Modify: `packages/server/src/use-cases/add-comment.ts`
- Test: `packages/server/src/use-cases/add-comment.test.ts`

- [ ] **Step 1: Add the failing test**

Append this `it(...)` inside the existing `describe('addComment use-case', …)` block in
`packages/server/src/use-cases/add-comment.test.ts`. Add `vi` to the vitest import
(`import { describe, expect, it, vi } from 'vitest'`) and add
`import type { Notifier } from '../notify/types'`.

```ts
  it('dispatches a comment.added notification carrying the thread page context', async () => {
    const repo = new InMemoryRepository()
    const ctx = makeCtx({ projectId: 'proj_x' })
    const thread = await repo.createThread(makeNewThread({ projectId: 'proj_x' }))
    const notify = vi.fn(async () => {})
    const notifier: Notifier = { name: 'spy', notify }
    await addComment(
      {
        ctx,
        params: { id: thread.id },
        query: undefined,
        body: { text: 'reply', author: makeAuthor() },
      },
      { repo, notifiers: [notifier] },
    )
    expect(notify).toHaveBeenCalledOnce()
    const event = notify.mock.calls[0]![0]
    expect(event.type).toBe('comment.added')
    expect(event.text).toBe('reply')
    expect(event.threadId).toBe(thread.id)
    expect(event.pageUrl).toBe('https://example.com/about')
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @airnauts/comments-server test add-comment`
Expected: FAIL — `notifiers` not assignable to `AddCommentDeps` (and `notify` never called).

- [ ] **Step 3: Wire dispatch into the use case**

Replace `packages/server/src/use-cases/add-comment.ts` with:

```ts
import type { AddCommentBody, Comment, ThreadId, ThreadIdParam } from '@airnauts/comments-core'
import type { Ctx } from '../ctx'
import { NotFoundError } from '../errors'
import { buildNotificationEvent } from '../notify/build-event'
import { dispatchNotifications } from '../notify/dispatch'
import type { Notifier } from '../notify/types'
import type { Repository } from '../repository/types'
import { resolveAttachments } from './resolve-attachments'

export type AddCommentDeps = { repo: Repository; notifiers?: Notifier[] }

export async function addComment(
  input: { ctx: Ctx; params: ThreadIdParam; query: undefined; body: AddCommentBody },
  deps: AddCommentDeps,
): Promise<Comment> {
  const { ctx, params, body } = input
  const scope = { projectId: ctx.projectId, env: ctx.env }
  // Confirm the thread exists in scope so we can return a typed 404; the repository's
  // own addComment throws an opaque Error. `existing` also supplies the page context
  // for the notification.
  const existing = await deps.repo.getThread(scope, params.id as ThreadId)
  if (!existing) throw new NotFoundError(`thread ${params.id} not found`)
  const attachments = await resolveAttachments(deps.repo, scope, body.attachmentIds)
  const comment: Comment = {
    id: ctx.ids.comment(),
    author: body.author,
    text: body.text,
    attachments,
    createdAt: ctx.now().toISOString(),
  }
  const saved = await deps.repo.addComment(scope, params.id as ThreadId, comment)
  await dispatchNotifications(
    deps.notifiers,
    buildNotificationEvent('comment.added', scope, existing, saved),
  )
  return saved
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @airnauts/comments-server test add-comment`
Expected: PASS (all existing tests plus the new one).

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/use-cases/add-comment.ts packages/server/src/use-cases/add-comment.test.ts
git commit -m "feat(server): notify on reply"
```

---

## Task 6: Expose `notifiers` on createCommentsServer

**Files:**
- Modify: `packages/server/src/server.ts`

- [ ] **Step 1: Add the option and thread it into the use-case deps**

In `packages/server/src/server.ts`:

1. Add the import near the other type imports (after the `StorageAdapter` import line):

```ts
import type { Notifier } from './notify/types'
```

2. Add the field to `CreateCommentsServerOptions` (place it right after the `storage: StorageAdapter` line):

```ts
  /** Outbound notification channels (e.g. Slack). Failures never break a write. */
  notifiers?: Notifier[]
```

3. Pass `notifiers` into both use-case factories. Change:

```ts
    createThread: (input) => createThread(input as never, { repo: opts.repository }),
```
to
```ts
    createThread: (input) =>
      createThread(input as never, { repo: opts.repository, notifiers: opts.notifiers }),
```
and change:
```ts
    addComment: (input) => addComment(input as never, { repo: opts.repository }),
```
to
```ts
    addComment: (input) =>
      addComment(input as never, { repo: opts.repository, notifiers: opts.notifiers }),
```

- [ ] **Step 2: Typecheck and run the full server suite**

Run: `pnpm --filter @airnauts/comments-server typecheck && pnpm --filter @airnauts/comments-server test`
Expected: PASS. (No change needed in `@airnauts/comments-next` — `createCommentsRoute` spreads its config straight into `createCommentsServer`, so `notifiers` flows through.)

- [ ] **Step 3: Commit**

```bash
git add packages/server/src/server.ts
git commit -m "feat(server): accept notifiers[] on createCommentsServer"
```

---

## Task 7: Scaffold the `@airnauts/comments-notifier-slack` package

**Files:**
- Create: `packages/notifier-slack/package.json`, `tsconfig.json`, `tsup.config.ts`, `vitest.config.ts`, `LICENSE`, `README.md`
- Modify: `tsconfig.json` (root)

- [ ] **Step 1: Create `packages/notifier-slack/package.json`**

```json
{
  "name": "@airnauts/comments-notifier-slack",
  "version": "0.0.0",
  "description": "Slack Incoming Webhook notifier for the Airnauts commenting tool server.",
  "keywords": [
    "comments",
    "commenting",
    "annotations",
    "feedback",
    "airnauts",
    "notifications",
    "slack"
  ],
  "license": "MIT",
  "author": "Airnauts",
  "homepage": "https://github.com/Airnauts/commenting-tool#readme",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/Airnauts/commenting-tool.git",
    "directory": "packages/notifier-slack"
  },
  "bugs": {
    "url": "https://github.com/Airnauts/commenting-tool/issues"
  },
  "type": "module",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
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
  "devDependencies": {
    "@airnauts/comments-test-support": "workspace:*"
  }
}
```

- [ ] **Step 2: Create the build/test config files (copied from `storage-fs`)**

`packages/notifier-slack/tsconfig.json`:

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

`packages/notifier-slack/tsup.config.ts`:

```ts
import { defineConfig } from 'tsup'

export default defineConfig({
  entry: { index: 'src/index.ts' },
  format: ['esm'],
  dts: false,
  sourcemap: true,
  outDir: 'dist',
  // tsup's clean does NOT delete dist/.tsbuildinfo, so declaration re-emit is
  // forced by `tsc --build --force` in package.json, not by this clean (ADR-0023).
  clean: true,
})
```

`packages/notifier-slack/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    name: 'notifier-slack',
    environment: 'node',
  },
})
```

- [ ] **Step 3: Copy the license**

```bash
cp packages/storage-fs/LICENSE packages/notifier-slack/LICENSE
```

- [ ] **Step 4: Create `packages/notifier-slack/README.md`**

````markdown
# @airnauts/comments-notifier-slack

Slack notifier for the [Airnauts commenting tool](https://github.com/Airnauts/commenting-tool)
server. Posts a message to a Slack channel whenever a reviewer creates a thread or replies.

## Setup

1. In Slack, create (or pick) an app and enable **Incoming Webhooks**.
2. **Add New Webhook to Workspace**, choose the channel, and copy the
   `https://hooks.slack.com/services/…` URL. The channel is baked into the URL —
   there is no separate channel name or bot token.

## Usage

```ts
import { createCommentsServer } from '@airnauts/comments-server'
import { slackNotifier } from '@airnauts/comments-notifier-slack'

createCommentsServer({
  repository,
  storage,
  notifiers: [slackNotifier({ webhookUrl: process.env.COMMENTS_SLACK_WEBHOOK_URL! })],
})
```

A notification failure never breaks the comment write. The webhook request is
bounded by a 3-second timeout.
````

- [ ] **Step 5: Register the package in the root `tsconfig.json`**

Add `{ "path": "packages/notifier-slack" }` to the `references` array in the root
`tsconfig.json` (after the `packages/next` entry).

- [ ] **Step 6: Install so pnpm links the new workspace package**

Run: `pnpm install`
Expected: lockfile updates, `@airnauts/comments-notifier-slack` linked. (No `src/` yet — that lands in Task 8. Do not build yet.)

- [ ] **Step 7: Commit**

```bash
git add packages/notifier-slack/package.json packages/notifier-slack/tsconfig.json packages/notifier-slack/tsup.config.ts packages/notifier-slack/vitest.config.ts packages/notifier-slack/LICENSE packages/notifier-slack/README.md tsconfig.json pnpm-lock.yaml
git commit -m "chore(notifier-slack): scaffold package"
```

---

## Task 8: slackNotifier implementation

**Files:**
- Create: `packages/notifier-slack/src/index.ts`
- Test: `packages/notifier-slack/src/index.test.ts`

- [ ] **Step 1: Write the failing test**

`packages/notifier-slack/src/index.test.ts`:

```ts
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
    const [url, init] = fetchMock.mock.calls[0]! as [string, RequestInit]
    expect(url).toBe('https://hooks.slack.com/services/T/B/x')
    expect(init.method).toBe('POST')
    const body = JSON.parse(init.body as string)
    expect(body.text).toContain('Alice')
    expect(body.text).toContain('Looks off here')
    expect(JSON.stringify(body.blocks)).toContain('https://example.com/about')
  })

  it('exposes a stable name', () => {
    expect(slackNotifier({ webhookUrl: 'https://hooks.slack.com/x' }).name).toBe('slack')
  })

  it('throws on a non-2xx response without leaking the webhook URL', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('no', { status: 500 })))
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
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @airnauts/comments-notifier-slack test`
Expected: FAIL — cannot find module `./index`.

- [ ] **Step 3: Write the implementation**

`packages/notifier-slack/src/index.ts`:

```ts
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
  const who = event.author.name
    ? `${event.author.name} (${event.author.email})`
    : event.author.email
  const quoted = event.text.replace(/\n/g, '\n>')

  return {
    // Plain-text fallback for notifications / accessibility.
    text: `${heading} by ${who}: ${event.text}`,
    blocks: [
      {
        type: 'section',
        text: { type: 'mrkdwn', text: `:speech_balloon: *${heading}* · <${event.pageUrl}|${where}>` },
      },
      {
        type: 'section',
        text: { type: 'mrkdwn', text: `>${quoted}` },
      },
      {
        type: 'context',
        elements: [{ type: 'mrkdwn', text: `${who} · <${event.pageUrl}|Open page>` }],
      },
    ],
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @airnauts/comments-notifier-slack test`
Expected: PASS (5 tests).

- [ ] **Step 5: Build + typecheck the new package**

Run: `pnpm --filter @airnauts/comments-notifier-slack build`
Expected: PASS — emits `dist/index.js` and `dist/index.d.ts`.

- [ ] **Step 6: Commit**

```bash
git add packages/notifier-slack/src/index.ts packages/notifier-slack/src/index.test.ts
git commit -m "feat(notifier-slack): post new comments to a Slack webhook"
```

---

## Task 9: Wire Slack into the example host (env-gated)

**Files:**
- Modify: `examples/nextjs-host/package.json`
- Modify: `examples/nextjs-host/app/api/comments/[...path]/route.ts`

- [ ] **Step 1: Add the workspace dependency**

In `examples/nextjs-host/package.json`, add to `dependencies` (keep the list alphabetized
with the other `@airnauts/comments-*` entries):

```json
"@airnauts/comments-notifier-slack": "workspace:*",
```

Then run: `pnpm install`
Expected: the example links the new package.

- [ ] **Step 2: Wire the notifier, gated on the env var**

Edit `examples/nextjs-host/app/api/comments/[...path]/route.ts`:

1. Add the import alongside the other adapter imports:

```ts
import { slackNotifier } from '@airnauts/comments-notifier-slack'
```

2. Add a `notifiers` field to the `createCommentsRoute({ … })` call, right after the
   `storage: …` block:

```ts
  // Slack notifications when COMMENTS_SLACK_WEBHOOK_URL is set, else none.
  notifiers: process.env.COMMENTS_SLACK_WEBHOOK_URL
    ? [slackNotifier({ webhookUrl: process.env.COMMENTS_SLACK_WEBHOOK_URL })]
    : [],
```

- [ ] **Step 3: Typecheck the example**

Run: `pnpm --filter @airnauts/comments-nextjs-host typecheck`
Expected: PASS. (If the example has no `typecheck` script, run `pnpm -w typecheck` or
`pnpm --filter @airnauts/comments-nextjs-host exec tsc --noEmit` instead.)

- [ ] **Step 4: Commit**

```bash
git add examples/nextjs-host/package.json examples/nextjs-host/app/api/comments/[...path]/route.ts pnpm-lock.yaml
git commit -m "chore(example): wire env-gated Slack notifier into the Next.js host"
```

---

## Task 10: ADR, architecture, integration docs, changeset

**Files:**
- Modify: `docs/adr.md`, `docs/architecture.md`, `docs/integration.md`
- Create: `.changeset/slack-notifications.md`

- [ ] **Step 1: Append ADR-0029 to `docs/adr.md`**

Add at the end of the file (newest-last):

```markdown
## ADR-0029: Notification seam + Slack notifier

- **Date:** 2026-06-03
- **Status:** accepted

**Context.** Integrators want to be told when reviewers leave comments, starting with
Slack, and more channels (email, …) are expected. We need an extension point that does
not couple the server core to any one provider, and notification delivery must never be
able to fail a comment write.

**Decision.** Add a generic `Notifier` output port to `@airnauts/comments-server`
(alongside `Repository` and `StorageAdapter`), injected via `notifiers?: Notifier[]` on
`createCommentsServer`. The `createThread` and `addComment` use cases build a shared
`NotificationEvent` after a successful write and fan it out through
`dispatchNotifications`, which uses `Promise.allSettled` — a notifier that throws is
logged (by `name`, never its credentials) and swallowed. Dispatch is **awaited** within
the request rather than fire-and-forget, because a detached promise is dropped when a
serverless function freezes after the response. The first concrete is a new publishable
package, `@airnauts/comments-notifier-slack`, which POSTs Block Kit JSON to a Slack
Incoming Webhook with a 3-second `AbortSignal.timeout` so a hung endpoint cannot stall
the write.

**Consequences.** New channels plug in with no core change. The notification round-trip
is added to comment-POST latency (acceptable for v1; a future `waitUntil`-style hook can
move it off the request path without changing the seam). The Slack link is the bare
`pageUrl`: a recipient sees comments only if they already hold the activation key
(localStorage or `?comments-key=…`); embedding the key and a `?comment=<threadId>`
deep-link is a documented follow-up.
```

- [ ] **Step 2: Mention the seam in `docs/architecture.md`**

In §2, under the monorepo package list, add a bullet after the storage-concretes bullet:

```markdown
- **`@airnauts/comments-notifier-slack`** — Slack Incoming Webhook notifier (first concrete
  of the `Notifier` seam; posts new-comment notifications).
```

In §4, in the `createCommentsServer({ … })` construction block, add a line after `pageKey?`:

```
  notifiers?,      // outbound channels (e.g. @airnauts/comments-notifier-slack); failure-isolated
```

and add a sentence after the "`Repository` and `StorageAdapter` are the only DB/IO seams." line:

```markdown
`Notifier` is a third, optional output seam: `createThread` / `addComment` fan a
`NotificationEvent` out to every configured notifier after the write, with failures
isolated so they can never break the write.
```

- [ ] **Step 3: Add a Slack section to `docs/integration.md`**

Append:

```markdown
## Slack notifications

Send a Slack message whenever a reviewer creates a thread or replies — with the author,
the comment text, and a link to the page.

1. In Slack, create (or pick) an app and enable **Incoming Webhooks**.
2. **Add New Webhook to Workspace**, choose the channel, and copy the
   `https://hooks.slack.com/services/…` URL. The channel is baked into the URL — there is
   no separate channel name or bot token.
3. Set it as `COMMENTS_SLACK_WEBHOOK_URL` and wire the notifier:

```ts
import { slackNotifier } from '@airnauts/comments-notifier-slack'

createCommentsServer({
  repository,
  storage,
  notifiers: [slackNotifier({ webhookUrl: process.env.COMMENTS_SLACK_WEBHOOK_URL! })],
})
```

A notification failure never breaks the comment write, and the webhook request is bounded
by a 3-second timeout. The link points at the page; a recipient sees the comments only if
they already hold the activation key (it is remembered after the first `?comments-key=…`
activation).
```

- [ ] **Step 4: Add the changeset**

`.changeset/slack-notifications.md`:

```markdown
---
"@airnauts/comments-server": minor
"@airnauts/comments-notifier-slack": minor
---

Add Slack notifications. The server now accepts `notifiers: [...]`, a generic outbound
channel seam, and the new `@airnauts/comments-notifier-slack` package posts a message to a
Slack channel (via an Incoming Webhook) whenever a reviewer creates a thread or replies —
showing who commented, the text, and a link to the page. Notification failures never break
a comment write.
```

- [ ] **Step 5: Commit**

```bash
git add docs/adr.md docs/architecture.md docs/integration.md .changeset/slack-notifications.md
git commit -m "docs: ADR-0029 + integration docs + changeset for Slack notifications"
```

---

## Task 11: Full verification

- [ ] **Step 1: Build, typecheck, lint and test the whole workspace**

Run: `pnpm -w build && pnpm -w typecheck && pnpm -w test && pnpm -w lint`
Expected: all green. (`pnpm lint` is Biome in CI mode — the strict gate. If a command
name differs, check the root `package.json` `scripts`.)

- [ ] **Step 2: Manual smoke test (optional, needs a real webhook)**

```bash
export COMMENTS_SLACK_WEBHOOK_URL='https://hooks.slack.com/services/…'
pnpm --filter @airnauts/comments-nextjs-host dev
```

Open the host, post a comment, and confirm the message lands in the Slack channel. Then
post a reply and confirm a second ("New reply") message arrives.

- [ ] **Step 3: Final commit (only if Step 1 produced changes, e.g. lint fixes)**

```bash
git add -A
git commit -m "chore: workspace verification for Slack notifications"
```

---

## Self-review notes

- **Spec coverage:** seam types (T1), shared event builder (T2, spec §4), failure-isolated
  dispatch (T3, spec §4), both triggers (T4 createThread, T5 addComment, spec §1), wiring
  option (T6, spec §3), Slack package with bounded fetch + page-only link (T7–T8, spec §5),
  example wiring + operator recipe (T9, spec §8), ADR-0029 / architecture / integration /
  changeset (T10, spec §7). Out-of-scope items (email, deep links) are intentionally absent.
- **No injected fetch** in the Slack package — tests stub the global with `vi.stubGlobal`,
  per the user's decision.
- **Type names are consistent** across tasks: `NotificationEvent`, `Notifier`,
  `buildNotificationEvent`, `dispatchNotifications`, `slackNotifier`, `formatSlackMessage`,
  `CreateThreadDeps`/`AddCommentDeps` (each gains `notifiers?: Notifier[]`).
```
