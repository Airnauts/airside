# Jira Thread Actions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a reviewer manually create a single Jira issue from a comments thread, persist the resulting issue link on the thread, and surface it in the widget — via a generic, typed server-extension capability model that future integrations reuse.

**Architecture:** Introduce a first-class `extensions` construction option on `createCommentsServer` with two capabilities — `NotificationExtension` (automatic event subscribers, reshaped from today's `Notifier`) and `ThreadActionExtension` (manual commands that may persist state). A generic `POST /threads/:id/actions/:actionId` endpoint authenticates, loads the thread, finds the registered action, re-checks `visibleWhen`, runs it, and atomically upserts the returned external link on the thread (keyed by `provider`). Thread read responses embed an evaluated, **response-only** `actions: ThreadActionDescriptor[]` array (never persisted) plus persisted `externalLinks`. A new optional `@airnauts/comments-integration-jira` package owns Jira Cloud REST v3 / ADF formatting. The client renders descriptors and external links generically in fixed slots — it never imports Jira code.

**Tech Stack:** TypeScript, zod (core schemas), pnpm workspaces + Changesets, Vitest, MongoDB driver + in-memory adapter, React (client/widget, Tailwind v4 `cmnt:` prefix), Jira Cloud REST API v3 (Atlassian Document Format).

---

## Decisions locked in (from design review)

1. **`actions` is response-only.** `externalLinks` is persisted state on `ThreadBase`; `actions` is computed per-request and lives only on response DTOs (`ThreadView`, `ThreadListItemView`). It must never reach `StoredThread`.
2. **"Scope" disambiguation.** `run`/`visibleWhen` receive the **server** scope `Scope = { projectId, env }` (from `packages/server/src/repository/types.ts`), renamed in code/comments to avoid confusion with `thread.scope` (the literal `'page'`).
3. **`visibleWhen` is typed against `ThreadBase`** (the field subset shared by full threads and list items), because descriptors are evaluated on both. v1 Jira predicate only reads `externalLinks` — a base field. This constraint is documented in the type.
4. **Notifier reshape NOW (breaking).** `slack` and `email` packages migrate to the `{ kind: 'notification', name, onEvent }` extension shape; factories renamed to `slackNotifications()` / `emailNotifications()`. `notifiers?` stays as a deprecated alias on the server that wraps `Notifier[]` into notification extensions. Changesets for both packages (minor, pre-1.0 breaking).
5. **Double-create: practical mitigation only.** Client loading-state + hiding the action once linked covers double-click; sequential duplicate returns the existing link / 409; upsert-by-`provider` dedups the stored link. The two-simultaneous-reviewers race is a documented known v1 limitation (logged, not prevented).
6. **Branch on top of PR #6 (email notifier).** This work assumes `event.threadUrl` exists and Slack's `threadParam` option is removed (PR #6 changes). Base the implementation branch on PR #6's branch, not `main`.

---

## File structure

**`packages/core`** (schemas + contract — the executable spec, authored first):
- Create `src/schemas/external-link.ts` — `ExternalLink` zod schema.
- Create `src/schemas/thread-action.ts` — `ThreadActionDescriptor` + `ExtensionSlot` zod schemas.
- Modify `src/schemas/thread.ts` — add `externalLinks` to `ThreadBase`; add `ThreadView` / `ThreadListItemView` response DTOs.
- Modify `src/schemas/index.ts` (barrel) + `src/index.ts` — export new schemas.
- Modify `src/contract/requests.ts` — `ThreadActionParam` (`:id` + `:actionId`).
- Modify `src/contract/responses.ts` — `ThreadListResponse` uses `ThreadListItemView`.
- Modify `src/contract/operations.ts` — add `runThreadAction` op; switch full-thread ops to `ThreadView`.

**`packages/server`** (extension model, routing, persistence wiring):
- Create `src/extensions/types.ts` — `ServerExtension`, `NotificationExtension`, `ThreadActionExtension`, `ThreadActionResult`, `IntegrationError`.
- Create `src/extensions/registry.ts` — split `extensions` into notification + action maps; evaluate descriptors.
- Modify `src/notify/types.ts` — keep `Notifier` (transport port) but add the notification-extension adapter note.
- Modify `src/notify/dispatch.ts` — dispatch over `NotificationExtension[]`.
- Create `src/use-cases/run-thread-action.ts` — the generic action use-case.
- Modify `src/use-cases/get-thread.ts`, `create-thread.ts`, `set-thread-status.ts`, `refresh-anchor.ts`, `list-threads.ts` — attach evaluated `actions` to responses.
- Modify `src/repository/types.ts` — add `upsertExternalLink` to `Repository`.
- Modify `src/repository/lazy.ts` — delegate `upsertExternalLink`.
- Modify `src/server.ts` — accept `extensions`; build registry; wire use-cases; deprecate `notifiers`.

**Adapters:**
- Modify `packages/adapter-memory/src/in-memory.ts` — implement `upsertExternalLink`.
- Modify `packages/adapter-mongo/src/repository.ts` — implement `upsertExternalLink`.
- Modify `packages/test-support/src/repository-contract.ts` — contract tests for external links.

**Notifier packages (reshape):**
- Modify `packages/notifier-slack/src/index.ts` — export `slackNotifications()` returning `NotificationExtension[]`.
- Modify `packages/notifier-email/src/index.ts` — export `emailNotifications()` returning `NotificationExtension[]`.

**New package `packages/integration-jira`** (`@airnauts/comments-integration-jira`):
- `package.json`, `tsconfig.json`, `src/index.ts` (`jiraIssues()` factory), `src/adf.ts` (ADF builder), `src/create-issue.ts` (`createJiraIssueFromThread`), `src/client.ts` (Jira REST client + error mapping), tests.

**`packages/client`** (descriptor-driven UI):
- Modify `src/api/client.ts` — `runThreadAction(id, actionId)`; type responses as `ThreadView`.
- Modify `src/threads/state.ts`, `src/threads/controller.ts` — store actions/externalLinks; `runAction`.
- Create `src/ui/ThreadActions.tsx` — renders toolbar action buttons from descriptors.
- Create `src/ui/ThreadMetadata.tsx` — renders external links.
- Modify `src/ui/ThreadConversation.tsx` — mount the two slots.

**Cross-cutting:**
- `docs/adr.md` — new ADR for the extension capability model + API change.
- `.changeset/*.md` — one changeset covering all touched publishable packages.

---

## Phase 0 — Branch + ADR

### Task 0.1: Create the isolated worktree on top of PR #6

**Files:** none (git only).

- [ ] **Step 1: Verify PR #6's branch name and that it's available locally**

Run: `git branch -a | grep -i email`
Expected: a branch like `email-notifier-spec` (the PR #6 branch). Note its exact name.

- [ ] **Step 2: Create a worktree branched from PR #6**

Run (substitute the real PR #6 branch name):
```bash
git worktree add .claude/worktrees/jira-thread-actions -b jira-thread-actions email-notifier-spec
```
Expected: new worktree created, branch `jira-thread-actions` based on PR #6.

- [ ] **Step 3: Install + build in dependency order**

Per memory (`project_worktree_setup`), symlinked node_modules break cross-package source edits. Use real install:
```bash
cd .claude/worktrees/jira-thread-actions && pnpm install && pnpm -r build
```
Expected: clean install + build (PR #6's `event.threadUrl` present).

### Task 0.2: Add the ADR

**Files:**
- Modify: `docs/adr.md` (append, newest-last)

- [ ] **Step 1: Append a new ADR record**

Append (use the next ADR number; check the last record in the file):
```markdown
## ADR-00NN: Server extension capability model (notifications + thread actions)

- **Date:** 2026-06-09
- **Status:** accepted

### Context
Notifications (Slack/email) were the only server plugin type, accepted via
`notifiers?`. We now need manual, user-triggered integrations (Jira issue
creation) that run on command and persist returned state on the thread. Both are
plugins, but they have different lifecycles: notifications subscribe to events
and must be failure-isolated; thread actions run explicit user commands, may fail
visibly, and persist external links.

### Decision
Introduce a single `extensions` construction option carrying a discriminated
union `ServerExtension = NotificationExtension | ThreadActionExtension`.
Extensions are server-side and may contain functions (`onEvent`, `run`,
`visibleWhen`); the client never receives executable extension code — only typed
`ThreadActionDescriptor`s evaluated server-side. Thread read responses embed a
computed, non-persisted `actions` array; threads persist `externalLinks`. A
generic `POST /threads/:id/actions/:actionId` endpoint runs actions. `notifiers?`
remains a deprecated alias that wraps `Notifier[]` into notification extensions.

### Consequences
- One loader/registration path for all server plugins; future integrations
  (Linear, GitHub Issues) reuse the thread-action shape with no server change.
- Notification failures stay isolated (`Promise.allSettled`); thread-action
  failures surface to the reviewer because the action was explicitly requested.
- `actions` is response-only — it must never be written to storage.
- `notifier-slack` / `notifier-email` public factory APIs change (pre-1.0
  breaking) to return notification extensions.
- Concurrent duplicate creation is not fully prevented in v1 (practical
  mitigation only); documented as a known limitation.
```

- [ ] **Step 2: Commit**

```bash
git add docs/adr.md
git commit -m "docs(adr): add extension capability model record"
```

---

## Phase 1 — Core schemas & contract (test-first)

> ADR-0010: write the failing test/fixture before implementation. All Phase 1 work is in `packages/core`. Run tests with `pnpm --filter @airnauts/comments-core test`.

### Task 1.1: `ExternalLink` schema

**Files:**
- Create: `packages/core/src/schemas/external-link.ts`
- Test: `packages/core/src/schemas/external-link.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest'
import { ExternalLink } from './external-link'

describe('ExternalLink', () => {
  it('accepts a fully-populated Jira link', () => {
    const link = {
      provider: 'jira',
      externalId: '10042',
      key: 'WEB-123',
      label: 'Jira WEB-123',
      url: 'https://company.atlassian.net/browse/WEB-123',
      createdAt: '2026-06-09T10:00:00.000Z',
    }
    expect(ExternalLink.parse(link)).toEqual(link)
  })

  it('allows optional key and createdBy to be omitted', () => {
    const link = {
      provider: 'custom',
      externalId: 'x1',
      label: 'X 1',
      url: 'https://example.com/x/1',
      createdAt: '2026-06-09T10:00:00.000Z',
    }
    expect(() => ExternalLink.parse(link)).not.toThrow()
  })

  it('rejects a non-URL url', () => {
    expect(() =>
      ExternalLink.parse({
        provider: 'jira',
        externalId: '1',
        label: 'x',
        url: 'not-a-url',
        createdAt: '2026-06-09T10:00:00.000Z',
      }),
    ).toThrow()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @airnauts/comments-core test external-link`
Expected: FAIL — cannot resolve `./external-link`.

- [ ] **Step 3: Implement the schema**

```ts
import { z } from 'zod'
import { Author } from './comment'
import { IsoTimestamp } from './primitives'

/**
 * A durable link from a thread to an external system (Jira, etc.).
 * Persisted on the thread; deduped by `provider`.
 */
export const ExternalLink = z
  .object({
    provider: z.string(),
    externalId: z.string(),
    key: z.string().optional(),
    label: z.string(),
    url: z.url(),
    createdAt: IsoTimestamp,
    createdBy: Author.optional(),
  })
  .meta({ id: 'ExternalLink' })
export type ExternalLink = z.infer<typeof ExternalLink>
```

> Note: confirm the real import paths for `Author` and `IsoTimestamp` — `Author` is in `./comment` (`packages/core/src/schemas/comment.ts:5`). Find `IsoTimestamp`'s module with `grep -rn "export const IsoTimestamp" packages/core/src` and fix the import to match.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @airnauts/comments-core test external-link`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/schemas/external-link.ts packages/core/src/schemas/external-link.test.ts
git commit -m "feat(core): add ExternalLink schema"
```

### Task 1.2: `ThreadActionDescriptor` + `ExtensionSlot` schemas

**Files:**
- Create: `packages/core/src/schemas/thread-action.ts`
- Test: `packages/core/src/schemas/thread-action.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest'
import { ExtensionSlot, ThreadActionDescriptor } from './thread-action'

describe('ThreadActionDescriptor', () => {
  it('accepts a Jira create descriptor', () => {
    const d = {
      id: 'jira.createIssue',
      provider: 'jira',
      label: 'Create Jira issue',
      slot: 'thread-toolbar',
      presentation: { style: 'primary' },
    }
    expect(ThreadActionDescriptor.parse(d)).toEqual(d)
  })

  it('allows presentation to be omitted', () => {
    expect(() =>
      ThreadActionDescriptor.parse({
        id: 'jira.createIssue',
        provider: 'jira',
        label: 'Create Jira issue',
        slot: 'thread-toolbar',
      }),
    ).not.toThrow()
  })

  it('rejects an unknown slot', () => {
    expect(() => ExtensionSlot.parse('nope')).toThrow()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @airnauts/comments-core test thread-action`
Expected: FAIL — cannot resolve `./thread-action`.

- [ ] **Step 3: Implement the schemas**

```ts
import { z } from 'zod'

export const ExtensionSlot = z.enum(['thread-toolbar', 'thread-metadata', 'panel-row-actions'])
export type ExtensionSlot = z.infer<typeof ExtensionSlot>

/** A server-evaluated, currently-renderable action. Contains no executable code. */
export const ThreadActionDescriptor = z
  .object({
    id: z.string(),
    provider: z.string(),
    label: z.string(),
    slot: ExtensionSlot,
    presentation: z
      .object({
        icon: z.string().optional(),
        style: z.enum(['primary', 'secondary', 'link']).optional(),
      })
      .optional(),
  })
  .meta({ id: 'ThreadActionDescriptor' })
export type ThreadActionDescriptor = z.infer<typeof ThreadActionDescriptor>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @airnauts/comments-core test thread-action`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/schemas/thread-action.ts packages/core/src/schemas/thread-action.test.ts
git commit -m "feat(core): add ThreadActionDescriptor and ExtensionSlot schemas"
```

### Task 1.3: Add `externalLinks` to `ThreadBase`; add `ThreadView` / `ThreadListItemView`

**Files:**
- Modify: `packages/core/src/schemas/thread.ts`
- Test: `packages/core/src/schemas/thread.test.ts` (add cases; create if absent)

- [ ] **Step 1: Write the failing test**

Add to the thread schema test file:
```ts
import { Thread, ThreadView, ThreadListItem, ThreadListItemView } from './thread'

describe('externalLinks + view DTOs', () => {
  const baseFields = {
    id: 't1',
    scope: 'page',
    pageKey: 'https://x.test/a',
    pageUrl: 'https://x.test/a',
    anchor: VALID_ANCHOR, // reuse the fixture already used in this file
    status: 'open',
    anchorState: 'anchored',
    commentCount: 1,
    unresolvedCount: 1,
    createdBy: { email: 'a@b.c' },
    createdAt: '2026-06-09T10:00:00.000Z',
    updatedAt: '2026-06-09T10:00:00.000Z',
    lastActivityAt: '2026-06-09T10:00:00.000Z',
    schemaVersion: 1,
  }

  it('Thread accepts optional externalLinks', () => {
    const t = {
      ...baseFields,
      comments: [],
      captureContext: VALID_CAPTURE, // reuse existing fixture
      externalLinks: [
        {
          provider: 'jira',
          externalId: '10042',
          key: 'WEB-123',
          label: 'Jira WEB-123',
          url: 'https://company.atlassian.net/browse/WEB-123',
          createdAt: '2026-06-09T10:00:00.000Z',
        },
      ],
    }
    expect(() => Thread.parse(t)).not.toThrow()
  })

  it('Thread is valid without externalLinks (optional)', () => {
    expect(() =>
      Thread.parse({ ...baseFields, comments: [], captureContext: VALID_CAPTURE }),
    ).not.toThrow()
  })

  it('ThreadView extends Thread with an actions array', () => {
    const view = {
      ...baseFields,
      comments: [],
      captureContext: VALID_CAPTURE,
      actions: [
        { id: 'jira.createIssue', provider: 'jira', label: 'Create Jira issue', slot: 'thread-toolbar' },
      ],
    }
    expect(() => ThreadView.parse(view)).not.toThrow()
  })

  it('Thread (storage shape) does NOT carry actions', () => {
    // actions is response-only; Thread.parse strips unknown keys by default
    const parsed = Thread.parse({
      ...baseFields,
      comments: [],
      captureContext: VALID_CAPTURE,
      actions: [{ id: 'x', provider: 'p', label: 'L', slot: 'thread-toolbar' }],
    }) as Record<string, unknown>
    expect(parsed.actions).toBeUndefined()
  })

  it('ThreadListItemView extends ThreadListItem with actions and externalLinks', () => {
    const view = {
      ...baseFields,
      rootComment: { text: 'hi', createdAt: '2026-06-09T10:00:00.000Z' },
      externalLinks: [],
      actions: [],
    }
    expect(() => ThreadListItemView.parse(view)).not.toThrow()
  })
})
```

> Reuse the existing `VALID_ANCHOR` / `VALID_CAPTURE` fixtures already present in the thread test file; if they have different names, substitute them.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @airnauts/comments-core test thread`
Expected: FAIL — `ThreadView` / `ThreadListItemView` not exported; `externalLinks` rejected.

- [ ] **Step 3: Implement the schema changes**

In `packages/core/src/schemas/thread.ts`:
1. Import the new schemas at the top:
```ts
import { ExternalLink } from './external-link'
import { ThreadActionDescriptor } from './thread-action'
```
2. Add `externalLinks` to `ThreadBase` (the shared object, currently lines 14–31):
```ts
  schemaVersion: z.number().int().positive(),
  externalLinks: z.array(ExternalLink).optional(),
})
```
3. After the existing `Thread` and `ThreadListItem` definitions, add the response DTOs:
```ts
/** Response-only: full thread plus server-evaluated, non-persisted actions. */
export const ThreadView = Thread.extend({
  actions: z.array(ThreadActionDescriptor),
}).meta({ id: 'ThreadView' })
export type ThreadView = z.infer<typeof ThreadView>

/** Response-only: list item plus server-evaluated actions. */
export const ThreadListItemView = ThreadListItem.extend({
  actions: z.array(ThreadActionDescriptor),
}).meta({ id: 'ThreadListItemView' })
export type ThreadListItemView = z.infer<typeof ThreadListItemView>
```

> `externalLinks` is on `ThreadBase`, so both `ThreadListItem` and `ThreadListItemView` already carry it — no extra field needed on the list view beyond `actions`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @airnauts/comments-core test thread`
Expected: PASS (including the "storage shape strips actions" assertion — relies on zod's default key-stripping).

- [ ] **Step 5: Export from barrels and commit**

Add `ExternalLink`, `ThreadActionDescriptor`, `ExtensionSlot`, `ThreadView`, `ThreadListItemView` to `packages/core/src/schemas/index.ts` and/or `packages/core/src/index.ts` (match the existing export style — `grep -n "ThreadListItem" packages/core/src/index.ts`).
```bash
git add packages/core/src
git commit -m "feat(core): persist externalLinks on threads; add ThreadView/ThreadListItemView response DTOs"
```

### Task 1.4: Action route param + operation; switch full-thread responses to views

**Files:**
- Modify: `packages/core/src/contract/requests.ts`
- Modify: `packages/core/src/contract/responses.ts`
- Modify: `packages/core/src/contract/operations.ts`
- Test: `packages/core/src/contract/operations.test.ts` (add cases; create if absent)

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest'
import { operations } from './operations'
import { ThreadActionParam } from './requests'

describe('runThreadAction operation', () => {
  it('is registered with the generic action path', () => {
    const op = operations.find((o) => o.operationId === 'runThreadAction')
    expect(op).toBeDefined()
    expect(op?.method).toBe('POST')
    expect(op?.path).toBe('/threads/:id/actions/:actionId')
    expect(op?.errors).toEqual(expect.arrayContaining(['NOT_FOUND', 'CONFLICT']))
  })

  it('ThreadActionParam parses id and actionId', () => {
    expect(ThreadActionParam.parse({ id: 't1', actionId: 'jira.createIssue' })).toEqual({
      id: 't1',
      actionId: 'jira.createIssue',
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @airnauts/comments-core test operations`
Expected: FAIL — no `runThreadAction` op; `ThreadActionParam` not exported.

- [ ] **Step 3: Implement**

In `requests.ts`, add (mirror the existing `ThreadIdParam` definition):
```ts
export const ThreadActionParam = z.object({
  id: z.string().min(1),
  actionId: z.string().min(1),
})
export type ThreadActionParam = z.infer<typeof ThreadActionParam>
```

In `responses.ts`, switch the list response to the view (keep the name `ThreadListResponse`):
```ts
import { ThreadListItemView } from '../schemas/thread'
export const ThreadListResponse = z
  .object({
    threads: z.array(ThreadListItemView),
    nextCursor: z.string().nullable(),
  })
  .meta({ id: 'ThreadListResponse' })
export type ThreadListResponse = z.infer<typeof ThreadListResponse>
```

In `operations.ts`:
1. Update imports: `import { Thread, ThreadView, ThreadListItem, ThreadListItemView } from '../schemas/thread'` and `import { ThreadActionParam, ... } from './requests'`.
2. Change the success schemas of full-thread ops from `Thread` → `ThreadView`: `createThread` (line 36), `getThread` (line 54), `setThreadStatus` (line 74).
3. Change `refreshAnchor` success (line 84) from `ThreadListItem` → `ThreadListItemView`.
4. Add the new op to the `operations` array:
```ts
  {
    operationId: 'runThreadAction',
    method: 'POST',
    path: '/threads/:id/actions/:actionId',
    summary: 'Run a registered manual thread action (e.g. create a Jira issue)',
    params: ThreadActionParam,
    success: { status: 200, schema: ThreadView },
    errors: ['VALIDATION_FAILED', 'NOT_FOUND', 'CONFLICT', 'INTEGRATION_ERROR', ...AUTH_ERRORS],
  },
```

- [ ] **Step 4: Add the `INTEGRATION_ERROR` error code**

In `packages/core/src/contract/errors.ts`, add `'INTEGRATION_ERROR'` to the `ErrorCode` union (find it: `grep -n "ErrorCode" packages/core/src/contract/errors.ts`). Add a matching default HTTP status (502) in whatever status map exists.

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter @airnauts/comments-core test`
Expected: PASS (operations + the contract/error tests).

- [ ] **Step 6: Build core and commit**

```bash
pnpm --filter @airnauts/comments-core build
git add packages/core/src
git commit -m "feat(core): add runThreadAction operation, ThreadActionParam, INTEGRATION_ERROR; views in responses"
```

---

## Phase 2 — Server extension model

> Tests: `pnpm --filter @airnauts/comments-server test`.

### Task 2.1: Extension types

**Files:**
- Create: `packages/server/src/extensions/types.ts`
- Test: `packages/server/src/extensions/types.test.ts` (type-level + a runtime smoke)

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest'
import type { ServerExtension, ThreadActionResult } from './types'
import { isThreadAction, isNotification } from './types'

describe('extension type guards', () => {
  const action: ServerExtension = {
    kind: 'thread-action',
    id: 'jira.createIssue',
    provider: 'jira',
    label: 'Create Jira issue',
    slot: 'thread-toolbar',
    run: async () => ({}) as ThreadActionResult,
  }
  const notif: ServerExtension = {
    kind: 'notification',
    name: 'slack',
    onEvent: async () => {},
  }

  it('isThreadAction narrows correctly', () => {
    expect(isThreadAction(action)).toBe(true)
    expect(isThreadAction(notif)).toBe(false)
  })
  it('isNotification narrows correctly', () => {
    expect(isNotification(notif)).toBe(true)
    expect(isNotification(action)).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @airnauts/comments-server test extensions/types`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
import type {
  ExtensionSlot,
  ExternalLink,
  Thread,
  ThreadActionDescriptor,
} from '@airnauts/comments-core'
import type { NotificationEvent } from '../notify/types'
import type { Scope } from '../repository/types'

/** What a thread action returns to the server to persist. */
export type ThreadActionResult = {
  /** Persisted on the thread, deduped by provider. Omit if the action persists nothing. */
  externalLink?: ExternalLink
}

/** Context passed to `run`. `scope` is the SERVER scope { projectId, env }. */
export type ThreadActionContext = { thread: Thread; scope: Scope }

/**
 * Context passed to `visibleWhen`. Typed against the BASE field subset because
 * descriptors are evaluated against both full threads and list items.
 * v1 predicates may only read base fields (e.g. externalLinks).
 */
export type ActionVisibilityContext = {
  thread: Pick<
    Thread,
    'id' | 'status' | 'anchorState' | 'externalLinks' | 'pageUrl' | 'pageTitle'
  >
  scope: Scope
}

export type NotificationExtension = {
  kind: 'notification'
  name: string
  onEvent(event: NotificationEvent): Promise<void>
}

export type ThreadActionExtension = {
  kind: 'thread-action'
  id: string
  provider: string
  label: string
  slot: ExtensionSlot
  presentation?: ThreadActionDescriptor['presentation']
  visibleWhen?: (ctx: ActionVisibilityContext) => boolean
  run: (ctx: ThreadActionContext) => Promise<ThreadActionResult>
}

export type ServerExtension = NotificationExtension | ThreadActionExtension

export function isNotification(e: ServerExtension): e is NotificationExtension {
  return e.kind === 'notification'
}
export function isThreadAction(e: ServerExtension): e is ThreadActionExtension {
  return e.kind === 'thread-action'
}

/** Thrown by an action's `run` for an upstream integration failure (auth/network/4xx-5xx). */
export class IntegrationError extends Error {
  readonly code = 'INTEGRATION_ERROR' as const
  constructor(
    message: string,
    readonly provider: string,
  ) {
    super(message)
    this.name = 'IntegrationError'
  }
}
```

> The `Pick<Thread, ...>` form avoids widening core's public surface with a `ThreadBase` export. If a future action needs more fields in `visibleWhen`, extend the Pick — but remember list-item paths won't have `comments`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @airnauts/comments-server test extensions/types`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/extensions/types.ts packages/server/src/extensions/types.test.ts
git commit -m "feat(server): add ServerExtension union and thread-action types"
```

### Task 2.2: Extension registry + descriptor evaluation

**Files:**
- Create: `packages/server/src/extensions/registry.ts`
- Test: `packages/server/src/extensions/registry.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest'
import { buildExtensionRegistry } from './registry'
import type { ServerExtension } from './types'

const scope = { projectId: 'p', env: null }
const thread = { id: 't1', status: 'open', anchorState: 'anchored', externalLinks: [] } as never

function jiraAction(): ServerExtension {
  return {
    kind: 'thread-action',
    id: 'jira.createIssue',
    provider: 'jira',
    label: 'Create Jira issue',
    slot: 'thread-toolbar',
    visibleWhen: ({ thread }) => !(thread.externalLinks ?? []).some((l) => l.provider === 'jira'),
    run: async () => ({}),
  }
}

describe('buildExtensionRegistry', () => {
  it('separates notification and action extensions', () => {
    const reg = buildExtensionRegistry([
      { kind: 'notification', name: 'slack', onEvent: async () => {} },
      jiraAction(),
    ])
    expect(reg.notifications).toHaveLength(1)
    expect(reg.getAction('jira.createIssue')).toBeDefined()
    expect(reg.getAction('nope')).toBeUndefined()
  })

  it('evaluateDescriptors returns only visible actions', () => {
    const reg = buildExtensionRegistry([jiraAction()])
    const visible = reg.evaluateDescriptors({ thread, scope })
    expect(visible.map((d) => d.id)).toEqual(['jira.createIssue'])
  })

  it('hides an action whose visibleWhen is false (jira already linked)', () => {
    const reg = buildExtensionRegistry([jiraAction()])
    const linked = { ...thread, externalLinks: [{ provider: 'jira' }] } as never
    expect(reg.evaluateDescriptors({ thread: linked, scope })).toEqual([])
  })

  it('rejects duplicate action ids at construction', () => {
    expect(() => buildExtensionRegistry([jiraAction(), jiraAction()])).toThrow(/duplicate/i)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @airnauts/comments-server test extensions/registry`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
import type { ThreadActionDescriptor } from '@airnauts/comments-core'
import {
  type ActionVisibilityContext,
  type NotificationExtension,
  type ServerExtension,
  type ThreadActionExtension,
  isNotification,
  isThreadAction,
} from './types'

export type ExtensionRegistry = {
  notifications: readonly NotificationExtension[]
  getAction(actionId: string): ThreadActionExtension | undefined
  evaluateDescriptors(ctx: ActionVisibilityContext): ThreadActionDescriptor[]
}

function toDescriptor(a: ThreadActionExtension): ThreadActionDescriptor {
  return {
    id: a.id,
    provider: a.provider,
    label: a.label,
    slot: a.slot,
    ...(a.presentation ? { presentation: a.presentation } : {}),
  }
}

export function buildExtensionRegistry(
  extensions: readonly ServerExtension[] = [],
): ExtensionRegistry {
  const notifications = extensions.filter(isNotification)
  const actions = extensions.filter(isThreadAction)
  const byId = new Map<string, ThreadActionExtension>()
  for (const a of actions) {
    if (byId.has(a.id)) throw new Error(`duplicate thread-action id '${a.id}'`)
    byId.set(a.id, a)
  }
  return {
    notifications,
    getAction: (id) => byId.get(id),
    evaluateDescriptors(ctx) {
      return actions.filter((a) => (a.visibleWhen ? a.visibleWhen(ctx) : true)).map(toDescriptor)
    },
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @airnauts/comments-server test extensions/registry`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/extensions
git commit -m "feat(server): extension registry with action routing and descriptor evaluation"
```

### Task 2.3: Reshape notification dispatch to `NotificationExtension[]`

**Files:**
- Modify: `packages/server/src/notify/dispatch.ts`
- Modify: `packages/server/src/notify/dispatch.test.ts`

- [ ] **Step 1: Update the failing test**

Rewrite the dispatch test to pass `NotificationExtension[]` (objects with `name` + `onEvent`) instead of `Notifier[]` (`notify`). Keep the existing assertions:
- empty/undefined list → no-op;
- one extension throwing does not reject and is logged with its `name`;
- all extensions are awaited.
```ts
import { describe, expect, it, vi } from 'vitest'
import { dispatchNotifications } from './dispatch'

const ev = { type: 'comment.added' } as never

it('isolates a failing notification extension and logs its name', async () => {
  const log = vi.fn()
  const good = { kind: 'notification', name: 'good', onEvent: vi.fn().mockResolvedValue(undefined) }
  const bad = { kind: 'notification', name: 'bad', onEvent: vi.fn().mockRejectedValue(new Error('x')) }
  await expect(dispatchNotifications([good, bad] as never, ev, log)).resolves.toBeUndefined()
  expect(good.onEvent).toHaveBeenCalledWith(ev)
  expect(log).toHaveBeenCalledWith(expect.stringContaining('bad'))
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @airnauts/comments-server test notify/dispatch`
Expected: FAIL — still references `.notify`.

- [ ] **Step 3: Implement**

Change the signature and body to use `NotificationExtension` + `onEvent`:
```ts
import type { NotificationExtension } from '../extensions/types'
import type { NotificationEvent } from './types'

export async function dispatchNotifications(
  notifications: readonly NotificationExtension[] | undefined,
  event: NotificationEvent,
  log: (message: string) => void = (m) => console.error(m),
): Promise<void> {
  if (!notifications || notifications.length === 0) return
  const results = await Promise.allSettled(notifications.map(async (n) => n.onEvent(event)))
  results.forEach((result, i) => {
    if (result.status === 'rejected') {
      const name = notifications[i]?.name ?? 'unknown'
      log(`[comments] notification "${name}" failed: ${String(result.reason)}`)
    }
  })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @airnauts/comments-server test notify/dispatch`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/notify/dispatch.ts packages/server/src/notify/dispatch.test.ts
git commit -m "refactor(server): dispatch notifications over NotificationExtension[]"
```

### Task 2.4: Thread `Notifier[]` deps → `NotificationExtension[]` in create/add use-cases

**Files:**
- Modify: `packages/server/src/use-cases/create-thread.ts`, `add-comment.ts`
- Modify: their tests

- [ ] **Step 1: Update tests + deps types**

In both use-cases change the deps type from `notifiers?: Notifier[]` to `notifications?: NotificationExtension[]` and pass that to `dispatchNotifications`. Update the use-case tests to supply `{ kind:'notification', name, onEvent }` stubs and assert `onEvent` was called with the built event.

- [ ] **Step 2: Run tests (red), implement, run (green)**

Run: `pnpm --filter @airnauts/comments-server test use-cases/create-thread use-cases/add-comment`
Expected: red then green.

- [ ] **Step 3: Commit**

```bash
git add packages/server/src/use-cases/create-thread.ts packages/server/src/use-cases/add-comment.ts packages/server/src/use-cases/*.test.ts
git commit -m "refactor(server): create/add-comment dispatch over notification extensions"
```

---

## Phase 3 — Repository: `upsertExternalLink` (contract-first)

### Task 3.1: Add to the contract test suite

**Files:**
- Modify: `packages/test-support/src/repository-contract.ts`

- [ ] **Step 1: Write the failing contract tests**

Inside `repositoryContract(...)`, add a `describe('upsertExternalLink', ...)` block. Use the existing helpers in this file for creating a thread (find the create helper — `grep -n "createThread" packages/test-support/src/repository-contract.ts`).
```ts
describe('upsertExternalLink', () => {
  it('appends a link and returns the updated thread', async () => {
    const repo = await makeRepo()
    const t = await repo.createThread(newThreadInput()) // existing helper in this file
    const link = {
      provider: 'jira',
      externalId: '10042',
      key: 'WEB-123',
      label: 'Jira WEB-123',
      url: 'https://x.atlassian.net/browse/WEB-123',
      createdAt: '2026-06-09T10:00:00.000Z',
    }
    const updated = await repo.upsertExternalLink(scope, t.id, link, '2026-06-09T10:00:00.000Z')
    expect(updated.externalLinks).toEqual([link])
  })

  it('upserts by provider (does not create a second link for the same provider)', async () => {
    const repo = await makeRepo()
    const t = await repo.createThread(newThreadInput())
    const a = { provider: 'jira', externalId: '1', label: 'A', url: 'https://x.test/a', createdAt: '2026-06-09T10:00:00.000Z' }
    const b = { provider: 'jira', externalId: '2', label: 'B', url: 'https://x.test/b', createdAt: '2026-06-09T10:01:00.000Z' }
    await repo.upsertExternalLink(scope, t.id, a, '2026-06-09T10:00:00.000Z')
    const after = await repo.upsertExternalLink(scope, t.id, b, '2026-06-09T10:01:00.000Z')
    const jira = after.externalLinks!.filter((l) => l.provider === 'jira')
    expect(jira).toHaveLength(1)
    expect(jira[0]!.externalId).toBe('2') // upsert replaced
  })

  it('keeps links from different providers', async () => {
    const repo = await makeRepo()
    const t = await repo.createThread(newThreadInput())
    await repo.upsertExternalLink(scope, t.id, { provider: 'jira', externalId: '1', label: 'J', url: 'https://x.test/j', createdAt: '2026-06-09T10:00:00.000Z' }, '2026-06-09T10:00:00.000Z')
    const after = await repo.upsertExternalLink(scope, t.id, { provider: 'linear', externalId: '2', label: 'L', url: 'https://x.test/l', createdAt: '2026-06-09T10:01:00.000Z' }, '2026-06-09T10:01:00.000Z')
    expect(after.externalLinks!.map((l) => l.provider).sort()).toEqual(['jira', 'linear'])
  })

  it('bumps updatedAt', async () => {
    const repo = await makeRepo()
    const t = await repo.createThread(newThreadInput())
    const updated = await repo.upsertExternalLink(scope, t.id, { provider: 'jira', externalId: '1', label: 'J', url: 'https://x.test/j', createdAt: '2026-06-09T10:00:00.000Z' }, '2026-06-09T12:00:00.000Z')
    expect(updated.updatedAt).toBe('2026-06-09T12:00:00.000Z')
  })

  it('rejects a thread outside scope', async () => {
    const repo = await makeRepo()
    const t = await repo.createThread(newThreadInput())
    await expect(
      repo.upsertExternalLink({ projectId: 'other', env: null }, t.id, { provider: 'jira', externalId: '1', label: 'J', url: 'https://x.test/j', createdAt: '2026-06-09T10:00:00.000Z' }, '2026-06-09T10:00:00.000Z'),
    ).rejects.toThrow()
  })
})
```

> Match the exact arg names/order to whatever `newThreadInput()` / `scope` helpers already exist in this file.

- [ ] **Step 2: Add the method to the `Repository` interface**

In `packages/server/src/repository/types.ts`, add to the `Repository` interface:
```ts
  upsertExternalLink(
    scope: Scope,
    threadId: ThreadId,
    link: ExternalLink,
    now: string,
  ): Promise<Thread>
```
Import `ExternalLink` from `@airnauts/comments-core`.

- [ ] **Step 3: Delegate in `lazyRepository`**

In `packages/server/src/repository/lazy.ts`, add:
```ts
    upsertExternalLink: (scope, id, link, now) =>
      get().then((r) => r.upsertExternalLink(scope, id, link, now)),
```

- [ ] **Step 4: Build server (adapters will not compile until 3.2/3.3 — expected)**

Run: `pnpm --filter @airnauts/comments-test-support build && pnpm --filter @airnauts/comments-server build`
Expected: builds; adapters now have a type error for the missing method (expected — next tasks).

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/repository packages/test-support/src/repository-contract.ts
git commit -m "feat(server): add upsertExternalLink to Repository contract + tests"
```

### Task 3.2: Implement in the memory adapter

**Files:**
- Modify: `packages/adapter-memory/src/in-memory.ts`

- [ ] **Step 1: Implement (model on `setStatus`, lines 160–176)**

```ts
async upsertExternalLink(
  scope: Scope,
  threadId: ThreadId,
  link: ExternalLink,
  now: string,
): Promise<Thread> {
  const t = this.threads.get(threadId)
  if (!t || !matchesScope(t, scope)) throw new Error('thread not found')
  const existing = t.externalLinks ?? []
  const nextLinks = [...existing.filter((l) => l.provider !== link.provider), clone(link)]
  const next: StoredThread = recomputeCounts({
    ...t,
    externalLinks: nextLinks,
    updatedAt: now,
    lastActivityAt: now,
  })
  this.threads.set(threadId, next)
  return toThread(clone(next))
}
```
Import `ExternalLink` from `@airnauts/comments-core`.

- [ ] **Step 2: Run the contract suite for memory**

Run: `pnpm --filter @airnauts/comments-adapter-memory test`
Expected: PASS including the new `upsertExternalLink` block.

- [ ] **Step 3: Commit**

```bash
git add packages/adapter-memory/src/in-memory.ts
git commit -m "feat(adapter-memory): implement upsertExternalLink (upsert by provider)"
```

### Task 3.3: Implement in the mongo adapter

**Files:**
- Modify: `packages/adapter-mongo/src/repository.ts`

- [ ] **Step 1: Implement (two-step pull+push by provider)**

MongoDB cannot `$pull` and `$push` the same array in one update. Use a `$pull` of any same-provider link, then a `$push` of the new one — both scoped. For v1 single-issue-per-provider this is acceptable; document the non-atomicity.
```ts
async upsertExternalLink(
  scope: Scope,
  threadId: ThreadId,
  link: ExternalLink,
  now: string,
): Promise<Thread> {
  const filter = { _id: threadId, ...scopeFilter(scope) }
  // 1. Remove any existing link for this provider.
  const pulled = await col.updateOne(filter, {
    $pull: { externalLinks: { provider: link.provider } },
  })
  if (pulled.matchedCount === 0) throw new Error('thread not found')
  // 2. Append the new link and bump updatedAt/lastActivityAt.
  const doc = await col.findOneAndUpdate(
    filter,
    { $push: { externalLinks: link }, $set: { updatedAt: now, lastActivityAt: now } },
    { returnDocument: 'after' },
  )
  if (!doc) throw new Error('thread not found')
  return toThread(doc)
}
```
Import `ExternalLink` from `@airnauts/comments-core`. `StoredThread` (line 28) derives from `Thread`, so it carries the optional `externalLinks` array once core is rebuilt.

- [ ] **Step 2: Run the contract suite for mongo**

Run: `pnpm --filter @airnauts/comments-adapter-mongo test`
Expected: PASS (needs the local Mongo/memory-server the suite already uses).

- [ ] **Step 3: Commit**

```bash
git add packages/adapter-mongo/src/repository.ts
git commit -m "feat(adapter-mongo): implement upsertExternalLink (pull+push by provider)"
```

---

## Phase 4 — Server: run-thread-action use-case + descriptor-bearing responses + wiring

> Implement Task 4.2 (`view.ts`) before 4.1's green step — 4.1 imports `toThreadView`.

### Task 4.2: `toThreadView` / `toThreadListItemView` helpers

**Files:**
- Create: `packages/server/src/use-cases/view.ts`
- Test: `packages/server/src/use-cases/view.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest'
import { toThreadView, toThreadListItemView } from './view'
import { buildExtensionRegistry } from '../extensions/registry'

const scope = { projectId: 'p', env: null }
const registry = buildExtensionRegistry([
  {
    kind: 'thread-action', id: 'jira.createIssue', provider: 'jira',
    label: 'Create Jira issue', slot: 'thread-toolbar',
    visibleWhen: ({ thread }) => !(thread.externalLinks ?? []).some((l) => l.provider === 'jira'),
    run: async () => ({}),
  },
])

it('toThreadView embeds evaluated actions', () => {
  const thread = { id: 't1', status: 'open', anchorState: 'anchored', externalLinks: [], comments: [] } as never
  expect(toThreadView(thread, registry, scope).actions.map((a) => a.id)).toEqual(['jira.createIssue'])
})

it('toThreadListItemView embeds evaluated actions', () => {
  const item = { id: 't1', status: 'open', anchorState: 'anchored', externalLinks: [] } as never
  expect(toThreadListItemView(item, registry, scope).actions).toHaveLength(1)
})
```

- [ ] **Step 2: Run (fail), implement, run (pass)**

```ts
import type { Scope } from '../repository/types'
import type { ExtensionRegistry } from '../extensions/registry'

export function toThreadView<T extends { externalLinks?: unknown[] }>(
  thread: T,
  registry: ExtensionRegistry,
  scope: Scope,
) {
  return { ...thread, actions: registry.evaluateDescriptors({ thread: thread as never, scope }) }
}
export function toThreadListItemView<T extends { externalLinks?: unknown[] }>(
  item: T,
  registry: ExtensionRegistry,
  scope: Scope,
) {
  return { ...item, actions: registry.evaluateDescriptors({ thread: item as never, scope }) }
}
```
Run: `pnpm --filter @airnauts/comments-server test use-cases/view` → PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/server/src/use-cases/view.ts packages/server/src/use-cases/view.test.ts
git commit -m "feat(server): toThreadView/toThreadListItemView descriptor helpers"
```

### Task 4.1: `runThreadAction` use-case

**Files:**
- Create: `packages/server/src/use-cases/run-thread-action.ts`
- Test: `packages/server/src/use-cases/run-thread-action.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it, vi } from 'vitest'
import { runThreadAction } from './run-thread-action'
import { buildExtensionRegistry } from '../extensions/registry'
import { NotFoundError, ConflictError } from '../errors'

function deps(over = {}) {
  const thread = { id: 't1', status: 'open', anchorState: 'anchored', externalLinks: [], comments: [] }
  const repo = {
    getThread: vi.fn().mockResolvedValue(thread),
    upsertExternalLink: vi.fn().mockImplementation((_s, _id, link) =>
      Promise.resolve({ ...thread, externalLinks: [link] }),
    ),
  }
  const link = { provider: 'jira', externalId: '1', key: 'WEB-1', label: 'Jira WEB-1', url: 'https://x.test/1', createdAt: 'now' }
  const registry = buildExtensionRegistry([
    {
      kind: 'thread-action',
      id: 'jira.createIssue',
      provider: 'jira',
      label: 'Create Jira issue',
      slot: 'thread-toolbar',
      visibleWhen: ({ thread }) => !(thread.externalLinks ?? []).some((l) => l.provider === 'jira'),
      run: vi.fn().mockResolvedValue({ externalLink: link }),
    },
  ])
  return { repo, registry, link, ...over }
}

const input = (actionId: string) => ({
  ctx: { projectId: 'p', env: null, now: () => new Date('2026-06-09T10:00:00Z') },
  params: { id: 't1', actionId },
  query: undefined,
  body: undefined,
})

describe('runThreadAction', () => {
  it('runs the action, persists the link, returns ThreadView with re-evaluated actions', async () => {
    const d = deps()
    const out = await runThreadAction(input('jira.createIssue') as never, d as never)
    expect(d.repo.upsertExternalLink).toHaveBeenCalledWith('p', 't1', d.link, expect.any(String))
    // jira now linked → create action no longer visible
    expect(out.actions).toEqual([])
    expect(out.externalLinks).toEqual([d.link])
  })

  it('404 when the action is not registered', async () => {
    await expect(runThreadAction(input('nope.x') as never, deps() as never)).rejects.toBeInstanceOf(NotFoundError)
  })

  it('404 when the thread does not exist', async () => {
    const d = deps()
    d.repo.getThread = vi.fn().mockResolvedValue(null)
    await expect(runThreadAction(input('jira.createIssue') as never, d as never)).rejects.toBeInstanceOf(NotFoundError)
  })

  it('409 when the action is registered but not visible (already linked)', async () => {
    const d = deps()
    d.repo.getThread = vi.fn().mockResolvedValue({
      id: 't1', status: 'open', anchorState: 'anchored', comments: [],
      externalLinks: [{ provider: 'jira', externalId: 'x', label: 'L', url: 'https://x.test/x', createdAt: 'now' }],
    })
    await expect(runThreadAction(input('jira.createIssue') as never, d as never)).rejects.toBeInstanceOf(ConflictError)
  })

  it('does not persist a link when run returns no externalLink', async () => {
    const d = deps()
    d.registry = buildExtensionRegistry([
      { kind: 'thread-action', id: 'noop', provider: 'x', label: 'N', slot: 'thread-toolbar', run: async () => ({}) },
    ])
    await runThreadAction(input('noop') as never, d as never)
    expect(d.repo.upsertExternalLink).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @airnauts/comments-server test run-thread-action`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
import type { ThreadActionParam, ThreadView } from '@airnauts/comments-core'
import type { Ctx } from '../ctx'
import { ConflictError, NotFoundError } from '../errors'
import type { ExtensionRegistry } from '../extensions/registry'
import type { Repository } from '../repository/types'
import { toThreadView } from './view'

export type RunThreadActionDeps = { repo: Repository; registry: ExtensionRegistry }

export async function runThreadAction(
  input: { ctx: Ctx; params: ThreadActionParam; query: undefined; body: undefined },
  deps: RunThreadActionDeps,
): Promise<ThreadView> {
  const { ctx, params } = input
  const scope = { projectId: ctx.projectId, env: ctx.env }

  const action = deps.registry.getAction(params.actionId)
  if (!action) throw new NotFoundError(`action ${params.actionId} not found`)

  const thread = await deps.repo.getThread(scope, params.id as never)
  if (!thread) throw new NotFoundError(`thread ${params.id} not found`)

  const visible = action.visibleWhen ? action.visibleWhen({ thread, scope }) : true
  if (!visible) throw new ConflictError(`action ${params.actionId} not available for this thread`)

  // Action failures are NOT isolated — the user explicitly requested this.
  // An IntegrationError from run() surfaces to the reviewer (mapped to 502).
  const result = await action.run({ thread, scope })

  if (!result.externalLink) {
    return toThreadView(thread, deps.registry, scope)
  }

  // Persist the link. If this throws AFTER the external issue was created,
  // the error surfaces and the issue key/url should already have been logged
  // by the action (v1 mitigation for the create-succeeds/persist-fails case).
  const updated = await deps.repo.upsertExternalLink(
    scope,
    params.id as never,
    result.externalLink,
    ctx.now().toISOString(),
  )
  return toThreadView(updated, deps.registry, scope)
}
```

> `ConflictError` — confirm it exists in `packages/server/src/errors.ts` (`setThreadStatus` already lists `CONFLICT`). If the class isn't exported, add it mapping to HTTP 409.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @airnauts/comments-server test run-thread-action`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/use-cases/run-thread-action.ts packages/server/src/use-cases/run-thread-action.test.ts
git commit -m "feat(server): runThreadAction use-case (route, visibility, persist)"
```

### Task 4.3: Attach `actions` to existing read responses

**Files:**
- Modify: `get-thread.ts`, `create-thread.ts`, `set-thread-status.ts`, `refresh-anchor.ts`, `list-threads.ts`
- Modify: their tests

- [ ] **Step 1: Update each use-case's deps + return**

Each read use-case gains `registry: ExtensionRegistry` in its deps and wraps its return value:
- `getThread`: `return toThreadView(thread, deps.registry, scope)`
- `createThread`: wrap the created thread → `ThreadView` (after notification dispatch).
- `setThreadStatus`: wrap the updated thread → `ThreadView`.
- `refreshAnchor`: wrap the returned `ThreadListItem` → `ThreadListItemView`.
- `listThreads`: map each item → `toThreadListItemView(item, deps.registry, scope)`.

- [ ] **Step 2: Update each test**

For each use-case test, pass a `registry` (use `buildExtensionRegistry([])` for the no-action case → `actions: []`) and assert the `actions` array is present. Add one test in `get-thread.test.ts` asserting a visible Jira action appears when a jira action is registered and no jira link exists.

- [ ] **Step 3: Run all server use-case tests**

Run: `pnpm --filter @airnauts/comments-server test use-cases`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/server/src/use-cases
git commit -m "feat(server): embed evaluated action descriptors in thread read responses"
```

### Task 4.4: Wire `extensions` into `createCommentsServer`

**Files:**
- Modify: `packages/server/src/server.ts`
- Modify: `packages/server/src/server.test.ts` (or wherever server construction is tested)

- [ ] **Step 1: Write/extend the failing test**

```ts
it('routes POST /threads/:id/actions/:actionId to the registered action', async () => {
  const link = { provider: 'jira', externalId: '1', key: 'WEB-1', label: 'Jira WEB-1', url: 'https://x.test/1', createdAt: '2026-06-09T10:00:00.000Z' }
  const run = vi.fn().mockResolvedValue({ externalLink: link })
  const repo = makeMemoryRepoWithThread('t1') // helper: seed one thread
  const server = createCommentsServer({
    secretKey: 'k', projectId: 'p', allowedOrigins: ['https://app.test'],
    repository: repo, storage: fakeStorage,
    extensions: [{ kind: 'thread-action', id: 'jira.createIssue', provider: 'jira', label: 'Create Jira issue', slot: 'thread-toolbar', run }],
  })
  const res = await server.handle(new Request('https://api.test/threads/t1/actions/jira.createIssue', {
    method: 'POST',
    headers: { origin: 'https://app.test', 'x-comments-key': 'k' },
  }))
  expect(res.status).toBe(200)
  expect(run).toHaveBeenCalled()
  const body = await res.json()
  expect(body.externalLinks).toEqual([link])
})

it('returns 404 for an unknown actionId', async () => { /* ... expect res.status 404 ... */ })
it('accepts legacy notifiers? and dispatches via onEvent', async () => { /* construct with notifiers:[{name,notify}], create a thread, assert notify called */ })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @airnauts/comments-server test server`
Expected: FAIL — `extensions` not accepted; no `runThreadAction` handler.

- [ ] **Step 3: Implement**

In `server.ts`:
1. Add to options and deprecate `notifiers`:
```ts
import type { Notifier } from './notify/types'
import type { ServerExtension, NotificationExtension } from './extensions/types'
import { buildExtensionRegistry } from './extensions/registry'

  /** Server plugins: notifications + thread actions. Forward-looking API. */
  extensions?: ServerExtension[]
  /** @deprecated Use `extensions`. Wrapped into notification extensions. */
  notifiers?: Notifier[]
```
2. Build the registry from `extensions` plus adapted legacy notifiers:
```ts
function adaptNotifier(n: Notifier): NotificationExtension {
  return { kind: 'notification', name: n.name, onEvent: (e) => n.notify(e) }
}

  const registry = buildExtensionRegistry([
    ...(opts.extensions ?? []),
    ...((opts.notifiers ?? []).map(adaptNotifier)),
  ])
```
3. Pass `registry.notifications` to create/add deps, and `registry` to read use-cases + the new handler:
```ts
  const useCases: UseCaseMap = {
    createThread: (input) =>
      createThread(input as never, { repo: opts.repository, notifications: registry.notifications, registry }),
    listThreads: (input) => listThreads(input as never, { repo: opts.repository, registry }),
    getThread: (input) => getThread(input as never, { repo: opts.repository, registry }),
    addComment: (input) =>
      addComment(input as never, { repo: opts.repository, notifications: registry.notifications }),
    setThreadStatus: (input) => setThreadStatus(input as never, { repo: opts.repository, registry }),
    refreshAnchor: (input) => refreshAnchor(input as never, { repo: opts.repository, registry }),
    runThreadAction: (input) => runThreadAction(input as never, { repo: opts.repository, registry }),
    uploadAttachment: (input) => uploadAttachment(input as never, { /* unchanged */ }),
  }
```
4. Import `runThreadAction`. The `assertUseCasesCoverOperations` guard now requires `runThreadAction` — satisfied by the entry above.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @airnauts/comments-server test`
Expected: PASS (full server suite).

- [ ] **Step 5: Build + commit**

```bash
pnpm --filter @airnauts/comments-server build
git add packages/server/src
git commit -m "feat(server): accept extensions, route thread actions, keep notifiers as alias"
```

---

## Phase 5 — Reshape notifier packages (breaking, on top of PR #6)

### Task 5.1: Slack → `slackNotifications()`

**Files:**
- Modify: `packages/notifier-slack/src/index.ts`
- Modify: `packages/notifier-slack/src/*.test.ts`

- [ ] **Step 1: Update the failing test**

Assert `slackNotifications({ webhookUrl })` returns an array of one `{ kind: 'notification', name: 'slack', onEvent }`, and that `onEvent` POSTs to the webhook (mock `fetch`), reading `event.threadUrl` (present post-PR #6). Drop any `threadParam` assertions (removed in PR #6).
```ts
import { slackNotifications } from './index'
it('returns a notification extension that posts to the webhook', async () => {
  const fetchMock = vi.fn().mockResolvedValue({ ok: true })
  vi.stubGlobal('fetch', fetchMock)
  const [ext] = slackNotifications({ webhookUrl: 'https://hooks.slack/x' })
  expect(ext.kind).toBe('notification')
  expect(ext.name).toBe('slack')
  await ext.onEvent({ type: 'comment.added', threadUrl: 'https://app/x?comments-thread=t1', text: 'hi', author: { email: 'a@b.c' }, pageUrl: 'https://app/x', threadId: 't1', projectId: 'p', createdAt: 'now' } as never)
  expect(fetchMock).toHaveBeenCalledWith('https://hooks.slack/x', expect.objectContaining({ method: 'POST' }))
})
```

- [ ] **Step 2: Run (fail), implement, run (pass)**

Rewrite the factory to return `NotificationExtension[]`:
```ts
import type { NotificationEvent, NotificationExtension } from '@airnauts/comments-server'
export type SlackNotificationsOptions = { webhookUrl: string }

export function slackNotifications(opts: SlackNotificationsOptions): NotificationExtension[] {
  return [
    {
      kind: 'notification',
      name: 'slack',
      async onEvent(event: NotificationEvent): Promise<void> {
        const res = await fetch(opts.webhookUrl, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(formatSlackMessage(event)), // uses event.threadUrl directly
          signal: AbortSignal.timeout(TIMEOUT_MS),
        })
        if (!res.ok) throw new Error(`slack webhook responded ${res.status}`)
      },
    },
  ]
}
```
Confirm `NotificationExtension` / `NotificationEvent` are exported from `@airnauts/comments-server`'s public entry (add to its `src/index.ts` exports if not).
Run: `pnpm --filter @airnauts/comments-notifier-slack test` → PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/notifier-slack/src
git commit -m "feat(notifier-slack)!: export slackNotifications returning a notification extension"
```

### Task 5.2: Email → `emailNotifications()`

**Files:**
- Modify: `packages/notifier-email/src/index.ts`
- Modify: its tests

- [ ] **Step 1–3: Same shape as Slack**

Rename `emailNotifier()` → `emailNotifications()` returning `NotificationExtension[]` with `name: 'email'` and `onEvent` delegating to the existing `EmailTransport`. Keep `EmailTransport`, SMTP/Resend subpath exports unchanged. Update tests to call the new factory and assert the extension shape.
Run: `pnpm --filter @airnauts/comments-notifier-email test` → PASS.
```bash
git add packages/notifier-email/src
git commit -m "feat(notifier-email)!: export emailNotifications returning a notification extension"
```

---

## Phase 6 — `@airnauts/comments-integration-jira`

> New publishable package. Mirror an existing package's `package.json` (notifier-slack) for `publishConfig: { access: public }`, MIT, `workspace:^` deps, build scripts (`tsc --build --force` per ADR-0023), and the Changesets `fixed` group. The `fixed` group version-syncs it automatically — confirm with the `writing-changesets` skill before publishing.

### Task 6.1: Scaffold the package

**Files:**
- Create: `packages/integration-jira/package.json`, `tsconfig.json`, `src/index.ts`

- [ ] **Step 1: Create package.json** (copy notifier-slack's and adjust)

```json
{
  "name": "@airnauts/comments-integration-jira",
  "version": "0.4.0",
  "description": "Create Jira issues from comment threads (server extension).",
  "license": "MIT",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": { ".": { "types": "./dist/index.d.ts", "import": "./dist/index.js" } },
  "files": ["dist"],
  "publishConfig": { "access": "public" },
  "scripts": {
    "build": "tsc --build --force",
    "test": "vitest run",
    "lint": "biome ci src"
  },
  "dependencies": { "@airnauts/comments-core": "workspace:^", "@airnauts/comments-server": "workspace:^" },
  "devDependencies": { "typescript": "...", "vitest": "..." }
}
```
> Match the exact `version` to the current `fixed` group version (memory says 0.4.0; verify with `cat packages/notifier-slack/package.json`). Match tsconfig to a sibling leaf package; remember the no-`references` rule (commit cb31868 — leaf packages dropped tsconfig `references` to stop the force-build race).

- [ ] **Step 2: Run install so the workspace links it**

Run: `pnpm install`
Expected: new package linked.

- [ ] **Step 3: Commit the scaffold**

```bash
git add packages/integration-jira/package.json packages/integration-jira/tsconfig.json
git commit -m "chore(integration-jira): scaffold package"
```

### Task 6.2: ADF description builder

**Files:**
- Create: `packages/integration-jira/src/adf.ts`
- Test: `packages/integration-jira/src/adf.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest'
import { buildSummary, buildAdfDescription } from './adf'

const thread = {
  id: 't1',
  pageUrl: 'https://app.test/about',
  pageTitle: 'About',
  status: 'open',
  anchorState: 'anchored',
  provenance: { branch: 'main', commitSha: 'abc123', deploymentId: 'd1' },
  comments: [
    { id: 'c1', author: { email: 'a@b.c', name: 'Ann' }, text: 'The header is misaligned on mobile', attachments: [{ id: 'x', url: 'https://cdn/x.png', name: 'x.png', contentType: 'image/png', size: 1 }], createdAt: '2026-06-09T10:00:00.000Z' },
    { id: 'c2', author: { email: 'b@b.c' }, text: 'Agreed', attachments: [], createdAt: '2026-06-09T11:00:00.000Z', editedAt: '2026-06-09T11:05:00.000Z' },
  ],
} as never

describe('buildSummary', () => {
  it('prefixes and uses the first comment, truncated', () => {
    expect(buildSummary(thread)).toBe('[Page feedback] The header is misaligned on mobile')
  })
  it('truncates long first comments to <= 255 chars total', () => {
    const long = { ...thread, comments: [{ ...thread.comments[0], text: 'x'.repeat(500) }] } as never
    expect(buildSummary(long).length).toBeLessThanOrEqual(255)
  })
})

describe('buildAdfDescription', () => {
  it('produces ADF doc v1 with page, thread meta, comments, provenance', () => {
    const doc = buildAdfDescription(thread)
    expect(doc).toMatchObject({ type: 'doc', version: 1 })
    const text = JSON.stringify(doc)
    expect(text).toContain('https://app.test/about')
    expect(text).toContain('Ann')
    expect(text).toContain('The header is misaligned on mobile')
    expect(text).toContain('abc123') // commit sha provenance
    expect(text).toContain('https://cdn/x.png') // attachment link
  })
})
```

- [ ] **Step 2: Run (fail), implement, run (pass)**

Implement `buildSummary(thread)` (`[Page feedback] ` + first-comment text, hard-truncated to 255) and `buildAdfDescription(thread)` returning an ADF `{ type:'doc', version:1, content:[...] }` with headings/paragraphs/bulletLists covering: page title+URL, thread id, status+anchorState, each comment (author, timestamp, text, editedAt when present), attachment links, provenance (branch/commit/deployment when present). Keep it a pure function over the `Thread` shape from core.
Run: `pnpm --filter @airnauts/comments-integration-jira test adf` → PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/integration-jira/src/adf.ts packages/integration-jira/src/adf.test.ts
git commit -m "feat(integration-jira): ADF description + summary builders"
```

### Task 6.3: Jira REST client + error mapping

**Files:**
- Create: `packages/integration-jira/src/client.ts`
- Test: `packages/integration-jira/src/client.test.ts`

- [ ] **Step 1: Write the failing test** (mock `fetch`)

```ts
import { describe, expect, it, vi } from 'vitest'
import { createJiraClient } from './client'
import { IntegrationError } from '@airnauts/comments-server'

const cfg = { siteUrl: 'https://co.atlassian.net', email: 'u@co', apiToken: 'tok', projectKey: 'WEB', issueType: 'Task' }

it('POSTs to /rest/api/3/issue with basic auth and returns key+id+url', async () => {
  const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 201, json: async () => ({ id: '10042', key: 'WEB-123' }) })
  vi.stubGlobal('fetch', fetchMock)
  const client = createJiraClient(cfg)
  const out = await client.createIssue({ summary: 'S', description: { type: 'doc', version: 1, content: [] }, labels: ['x'] })
  const [url, init] = fetchMock.mock.calls[0]
  expect(url).toBe('https://co.atlassian.net/rest/api/3/issue')
  expect(init.headers.authorization).toMatch(/^Basic /)
  expect(out).toEqual({ id: '10042', key: 'WEB-123', url: 'https://co.atlassian.net/browse/WEB-123' })
})

it('maps a 401 to an IntegrationError', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401, text: async () => 'no' }))
  await expect(createJiraClient(cfg).createIssue({ summary: 'S', description: { type: 'doc', version: 1, content: [] } }))
    .rejects.toBeInstanceOf(IntegrationError)
})

it('maps a network throw to an IntegrationError', async () => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('econnrefused')))
  await expect(createJiraClient(cfg).createIssue({ summary: 'S', description: { type: 'doc', version: 1, content: [] } }))
    .rejects.toBeInstanceOf(IntegrationError)
})
```

- [ ] **Step 2: Run (fail), implement, run (pass)**

Implement `createJiraClient(cfg)` exposing `createIssue({ summary, description, labels })` and a `JiraConfig` type:
- Basic auth header: `Basic ` + base64(`${email}:${apiToken}`).
- `POST ${siteUrl}/rest/api/3/issue` with body `{ fields: { project: { key: projectKey }, issuetype: { name: issueType ?? 'Task' }, summary, description, labels } }`, 5s `AbortSignal.timeout`.
- On `!res.ok` or thrown network error → `throw new IntegrationError(msg, 'jira')`. Never log the token.
- On success → `{ id, key, url: \`${siteUrl}/browse/${key}\` }`.
Run: `pnpm --filter @airnauts/comments-integration-jira test client` → PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/integration-jira/src/client.ts packages/integration-jira/src/client.test.ts
git commit -m "feat(integration-jira): Jira Cloud REST client with typed integration errors"
```

### Task 6.4: `createJiraIssueFromThread` + `jiraIssues()` factory

**Files:**
- Create: `packages/integration-jira/src/create-issue.ts`
- Modify: `packages/integration-jira/src/index.ts`
- Test: `packages/integration-jira/src/index.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it, vi } from 'vitest'
import { jiraIssues } from './index'

const cfg = { siteUrl: 'https://co.atlassian.net', email: 'u@co', apiToken: 'tok', projectKey: 'WEB', labels: ['comments-feedback'] }
const thread = { id: 't1', pageUrl: 'https://app/about', pageTitle: 'About', status: 'open', anchorState: 'anchored', externalLinks: [], comments: [{ id: 'c1', author: { email: 'a@b.c' }, text: 'bug', attachments: [], createdAt: 'now' }] } as never

it('returns one thread-action extension with the create-issue id', () => {
  const [ext] = jiraIssues(cfg)
  expect(ext).toMatchObject({ kind: 'thread-action', id: 'jira.createIssue', provider: 'jira', slot: 'thread-toolbar' })
})

it('visibleWhen hides the action when a jira link already exists', () => {
  const [ext] = jiraIssues(cfg)
  expect(ext.visibleWhen({ thread, scope: { projectId: 'p', env: null } })).toBe(true)
  const linked = { ...thread, externalLinks: [{ provider: 'jira' }] }
  expect(ext.visibleWhen({ thread: linked, scope: { projectId: 'p', env: null } })).toBe(false)
})

it('run creates an issue and returns an externalLink', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 201, json: async () => ({ id: '10042', key: 'WEB-123' }) }))
  const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
  const [ext] = jiraIssues(cfg)
  const result = await ext.run({ thread, scope: { projectId: 'p', env: null } })
  expect(result.externalLink).toMatchObject({
    provider: 'jira', externalId: '10042', key: 'WEB-123',
    label: 'Jira WEB-123', url: 'https://co.atlassian.net/browse/WEB-123',
  })
  // create-succeeds path logs the key/url so a later persist failure is recoverable
  expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('WEB-123'))
  logSpy.mockRestore()
})

it('throws at construction when required config is missing', () => {
  expect(() => jiraIssues({ ...cfg, apiToken: '' } as never)).toThrow(/apiToken/)
})
```

- [ ] **Step 2: Run (fail), implement, run (pass)**

`create-issue.ts`:
```ts
import type { ThreadActionContext, ThreadActionResult } from '@airnauts/comments-server'
import { buildAdfDescription, buildSummary } from './adf'
import { createJiraClient, type JiraConfig } from './client'

export function makeCreateJiraIssueFromThread(cfg: JiraConfig, labels?: string[]) {
  const client = createJiraClient(cfg)
  return async function createJiraIssueFromThread(
    ctx: ThreadActionContext,
  ): Promise<ThreadActionResult> {
    const issue = await client.createIssue({
      summary: buildSummary(ctx.thread),
      description: buildAdfDescription(ctx.thread),
      labels,
    })
    // Recovery aid for the create-succeeds/persist-fails edge case.
    console.log(`[comments-jira] created issue ${issue.key} (${issue.url}) for thread ${ctx.thread.id}`)
    return {
      externalLink: {
        provider: 'jira',
        externalId: issue.id,
        key: issue.key,
        label: `Jira ${issue.key}`,
        url: issue.url,
        createdAt: new Date().toISOString(),
      },
    }
  }
}
```
`index.ts`:
```ts
import type { ServerExtension } from '@airnauts/comments-server'
import { makeCreateJiraIssueFromThread } from './create-issue'
import type { JiraConfig } from './client'

export type JiraIssuesOptions = JiraConfig & { labels?: string[] }

function hasExternalLink(thread: { externalLinks?: { provider: string }[] }, provider: string): boolean {
  return (thread.externalLinks ?? []).some((l) => l.provider === provider)
}

export function jiraIssues(opts: JiraIssuesOptions): ServerExtension[] {
  // Presence validation at construction (fail fast at server startup).
  for (const k of ['siteUrl', 'email', 'apiToken', 'projectKey'] as const) {
    if (!opts[k]) throw new Error(`jiraIssues: missing required config '${k}'`)
  }
  const run = makeCreateJiraIssueFromThread(opts, opts.labels)
  return [
    {
      kind: 'thread-action',
      id: 'jira.createIssue',
      provider: 'jira',
      label: 'Create Jira issue',
      slot: 'thread-toolbar',
      presentation: { style: 'primary' },
      visibleWhen: ({ thread }) => !hasExternalLink(thread, 'jira'),
      run,
    },
  ]
}
```
Run: `pnpm --filter @airnauts/comments-integration-jira test` → PASS.

- [ ] **Step 3: Build + commit**

```bash
pnpm --filter @airnauts/comments-integration-jira build
git add packages/integration-jira/src
git commit -m "feat(integration-jira): jiraIssues factory + createJiraIssueFromThread action"
```

---

## Phase 7 — Client: descriptor-driven UI

> Tests: `pnpm --filter @airnauts/comments-client test`. Reuse the harness pattern from `ThreadPopover.test.tsx`.

### Task 7.1: API client — `runThreadAction`

**Files:**
- Modify: `packages/client/src/api/client.ts`
- Test: `packages/client/src/api/client.test.ts`

- [ ] **Step 1: Write the failing test**

Assert `runThreadAction('t1','jira.createIssue')` does `POST /threads/t1/actions/jira.createIssue` with the `x-comments-key` header and returns the parsed `ThreadView`. Mirror the existing `addComment` client test.

- [ ] **Step 2: Run (fail), implement, run (pass)**

Add to the `ApiClient` interface + implementation:
```ts
runThreadAction(id: string, actionId: string): Promise<ThreadView>
```
```ts
runThreadAction: (id, actionId) =>
  request<ThreadView>('POST', `/threads/${id}/actions/${actionId}`),
```
Change `getThread` / `createThread` / `setThreadStatus` return types from `Thread` → `ThreadView` (they now carry `actions`). `Thread` remains assignable, so call sites compile.
Run: `pnpm --filter @airnauts/comments-client test api/client` → PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/client/src/api/client.ts packages/client/src/api/client.test.ts
git commit -m "feat(client): runThreadAction API method; thread responses typed as ThreadView"
```

### Task 7.2: State + controller — actions/externalLinks + `runAction`

**Files:**
- Modify: `packages/client/src/threads/state.ts`, `packages/client/src/threads/controller.ts`
- Test: `packages/client/src/threads/controller.test.ts`

- [ ] **Step 1: Write the failing test**

Assert `controller.runAction(id, actionId)`:
- sets a per-id in-flight action flag (dispatch `ACTION_RUNNING`),
- calls `client.runThreadAction`,
- on success replaces the detail with the returned `ThreadView` (so `actions` + `externalLinks` update) and clears the flag, returns `true`,
- on failure clears the flag and returns `false`.

- [ ] **Step 2: Run (fail), implement, run (pass)**

In `state.ts`: store `actions` + `externalLinks` as part of `detailById[id]` (widen the stored type from `Thread` to `ThreadView`), and add `runningActionById: Record<string, string | null>` for in-flight tracking. Add reducer cases `ACTION_RUNNING` / `ACTION_DONE`; have `DETAIL_LOADED` carry the full `ThreadView`.
In `controller.ts`, add:
```ts
async runAction(id, actionId) {
  dispatch({ type: 'ACTION_RUNNING', id, actionId })
  try {
    const view = await deps.client.runThreadAction(id, actionId)
    dispatch({ type: 'DETAIL_LOADED', id, thread: view }) // replaces actions + externalLinks
    dispatch({ type: 'ACTION_DONE', id })
    statusListener?.(id, view.status) // keep panel in sync if status changed
    return true
  } catch {
    dispatch({ type: 'ACTION_DONE', id })
    return false
  }
}
```
Add `runAction` to the `Controller` type and a `useThreadActions(id)` selector returning `{ actions, externalLinks, runningActionId }`.
Run: `pnpm --filter @airnauts/comments-client test threads/controller` → PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/client/src/threads
git commit -m "feat(client): controller.runAction + actions/externalLinks in thread state"
```

### Task 7.3: `ThreadActions` (toolbar) + `ThreadMetadata` (links) components

**Files:**
- Create: `packages/client/src/ui/ThreadActions.tsx`, `packages/client/src/ui/ThreadMetadata.tsx`
- Test: `packages/client/src/ui/ThreadActions.test.tsx`, `packages/client/src/ui/ThreadMetadata.test.tsx`

- [ ] **Step 1: Write the failing tests**

`ThreadActions`:
- renders a `Button` per descriptor whose `slot === 'thread-toolbar'`, labelled by `descriptor.label`;
- clicking calls `controller.runAction(id, descriptor.id)`;
- shows loading state (disabled) while `runningActionId === descriptor.id`;
- shows an error toast when `runAction` resolves `false`.
`ThreadMetadata`:
- renders an `<a>` per external link with `href={link.url}`, text `link.label`, `target="_blank" rel="noreferrer"`;
- renders nothing when there are no links.

- [ ] **Step 2: Run (fail), implement, run (pass)**

`ThreadActions.tsx` — generic, no Jira knowledge; map `presentation.style` → Button `variant` (`primary`→`primary`, `link`→`link`, else `outline`):
```tsx
export function ThreadActions({ id, actions, controller }: { id: string; actions: ThreadActionDescriptor[]; controller: Controller }) {
  const toast = useToast()
  const running = useThreadActions(id).runningActionId
  const toolbar = actions.filter((a) => a.slot === 'thread-toolbar')
  if (toolbar.length === 0) return null
  return (
    <>
      {toolbar.map((a) => (
        <Button
          key={a.id}
          variant={a.presentation?.style === 'primary' ? 'primary' : a.presentation?.style === 'link' ? 'link' : 'outline'}
          size="sm"
          disabled={running === a.id}
          onClick={async () => {
            const ok = await controller.runAction(id, a.id)
            if (!ok) toast(`${a.label} failed`)
          }}
        >
          {running === a.id ? '…' : a.label}
        </Button>
      ))}
    </>
  )
}
```
`ThreadMetadata.tsx`:
```tsx
export function ThreadMetadata({ links }: { links: ExternalLink[] }) {
  if (!links || links.length === 0) return null
  return (
    <div className="cmnt:flex cmnt:flex-wrap cmnt:gap-2 cmnt:px-3 cmnt:py-1.5 cmnt:text-[11px]">
      {links.map((l) => (
        <a key={`${l.provider}:${l.externalId}`} href={l.url} target="_blank" rel="noreferrer"
           className="cmnt:text-blue-600 cmnt:hover:underline">
          {l.label}
        </a>
      ))}
    </div>
  )
}
```
Use the `cmnt:` Tailwind prefix and the existing `Button` primitive. Run: `pnpm --filter @airnauts/comments-client test ThreadActions ThreadMetadata` → PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/client/src/ui/ThreadActions.tsx packages/client/src/ui/ThreadMetadata.tsx packages/client/src/ui/ThreadActions.test.tsx packages/client/src/ui/ThreadMetadata.test.tsx
git commit -m "feat(client): generic ThreadActions toolbar + ThreadMetadata external links"
```

### Task 7.4: Mount the slots in `ThreadConversation`

**Files:**
- Modify: `packages/client/src/ui/ThreadConversation.tsx`
- Modify: `packages/client/src/ui/ThreadPopover.test.tsx` (integration assertions)

- [ ] **Step 1: Write the failing integration test**

Extend the popover harness so the mocked `getThread` returns a `ThreadView` with one toolbar action (`jira.createIssue`) and no external links. Assert:
- the "Create Jira issue" button renders in the open thread;
- clicking it calls `client.runThreadAction('a', 'jira.createIssue')` (mock returns a `ThreadView` with the action gone + one external link);
- after success, the button disappears and a "Jira WEB-123" link with the right `href` renders.

- [ ] **Step 2: Run (fail), implement, run (pass)**

In `ThreadConversation.tsx`:
- read `const { actions, externalLinks, runningActionId } = useThreadActions(id)`;
- render `<ThreadActions id={id} actions={actions} controller={controller} />` inside the header actions `<div>` (around line 136, next to Resolve/Reopen);
- render `<ThreadMetadata links={externalLinks} />` as a row directly under the header (before the comment list).
Run: `pnpm --filter @airnauts/comments-client test ThreadPopover` → PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/client/src/ui/ThreadConversation.tsx packages/client/src/ui/ThreadPopover.test.tsx
git commit -m "feat(client): render action toolbar + external-link metadata in thread view"
```

---

## Phase 8 — Integration, docs, changesets, verification

### Task 8.1: Full build + test sweep

- [ ] **Step 1: Build everything in dependency order**

Run: `pnpm -r build`
Expected: all packages build (no stale `.d.ts` — ADR-0023 force build).

- [ ] **Step 2: Run the whole test suite**

Run: `pnpm -r test`
Expected: all green (core, server, both adapters, both notifiers, integration-jira, client).

- [ ] **Step 3: Lint (the strict gate)**

Run: `pnpm lint`
Expected: biome ci passes (remember `border-0` not `border-none`, prefix-first variants per `reference_widget_tailwind_v4_gotchas`).

### Task 8.2: Integration docs

**Files:**
- Modify: the integration docs (find where Slack/notifier setup is documented — `grep -rln "slackNotifier\|notifiers" docs examples README.md`).

- [ ] **Step 1: Update construction examples**

Replace `notifiers: [slackNotifier(...)]` examples with `extensions: [slackNotifications(...), jiraIssues(...)]`. Add a short Jira setup section: required config (siteUrl, email, apiToken, projectKey), where to get an API token, that creds stay server-side, and the one-issue-per-thread behavior. Note the known v1 limitation: simultaneous create requests from two reviewers may create two issues.

- [ ] **Step 2: Commit**

```bash
git add docs examples README.md
git commit -m "docs: document extensions API and Jira integration setup"
```

### Task 8.3: Changesets

> Use the `writing-changesets` skill. Pre-1.0 policy: breaking → minor.

- [ ] **Step 1: Create changesets**

Run `pnpm changeset` (or hand-write `.changeset/*.md`) covering:
- `@airnauts/comments-core` (minor): persist `externalLinks`; add thread-action descriptors and `ThreadView`/`ThreadListItemView`; new action operation.
- `@airnauts/comments-server` (minor): `extensions` construction option + generic thread-action endpoint; `notifiers` deprecated.
- `@airnauts/comments-adapter-memory` + `@airnauts/comments-adapter-mongo` (minor): persist external links via `upsertExternalLink`.
- `@airnauts/comments-notifier-slack` + `@airnauts/comments-notifier-email` (minor, breaking): factories renamed to `slackNotifications` / `emailNotifications` returning notification extensions.
- `@airnauts/comments-integration-jira` (minor): new package — create Jira issues from threads.
- `@airnauts/comments-client` (minor): renders thread actions + external-link metadata.

Write summaries for the changelog reader (user-visible effect), per CLAUDE.md.

- [ ] **Step 2: Commit**

```bash
git add .changeset
git commit -m "chore: add changesets for Jira thread actions + extension model"
```

### Task 8.4: Final review checkpoint

- [ ] **Step 1: Run `requesting-code-review`** (superpowers skill) against the branch before integrating.
- [ ] **Step 2:** Use `finishing-a-development-branch` to decide merge vs PR. Per CLAUDE.md, development lands directly on `main` pre-beta — but this branch is based on PR #6; merge order: PR #6 first, then this.

---

## Self-review notes (gaps to watch during execution)

1. **`Thread` vs `ThreadView` at call sites:** widening client return types from `Thread` to `ThreadView` is safe (superset), but confirm no code does an exhaustive key check that breaks on the extra `actions` key.
2. **`actions` must not be persisted:** Task 1.3 includes an explicit "storage strips actions" test relying on zod default key-stripping — keep it; it's the guard for Decision #1.
3. **`refreshAnchor` returns a list-item view:** its `visibleWhen` evaluation runs on a `ThreadListItem` lacking `comments` — fine because v1 predicates only read base fields (Decision #3). If a future action's `visibleWhen` reads `comments`, it will silently see `undefined` on list paths; the `ActionVisibilityContext` type comment documents this.
4. **Mongo upsert non-atomicity:** the pull+push is two ops. The simultaneous-two-reviewers race (Decision #5) can still interleave; acceptable for v1, logged via the action's `console.log` of the created key. Do not present it as fully prevented.
5. **PR #6 coupling (Decision #6):** if PR #6's `NotificationEvent`/`threadUrl` shape differs from what Phase 5 assumes, reconcile against the actual merged PR #6 before reshaping Slack/email.
6. **Extension types export surface:** Phase 5 + 6 import types from `@airnauts/comments-server` — ensure `src/index.ts` re-exports `ServerExtension`, `NotificationExtension`, `ThreadActionContext`, `ThreadActionResult`, `IntegrationError`, and `NotificationEvent`.
