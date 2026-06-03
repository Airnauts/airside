# Sidebar master–detail view — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the comments sidebar into a Vercel-toolbar-style master–detail surface — list cards showing each thread's root comment, an in-sidebar detail view with a Back button, a parallel pin popover, synced composer drafts, and a copy-link deep-link.

**Architecture:** Backend gains one additive `ThreadListItem.rootComment` field (built test-first through the shared adapter contract suite). The client extends the existing `panel/` slice with a `list | detail` view, adds a per-thread `drafts` slice shared between the sidebar detail and the pin popover, extracts a shared `ThreadConversation` from `ThreadCard`, grows the cross-page focus handoff to also open the detail, and adds a `?comments-thread` deep-link.

**Tech Stack:** TypeScript, zod (core schemas), React + Radix (client widget), Vitest (unit/component), Playwright (e2e), Tailwind v4 with the `cmnt:` prefix, Changesets.

**Spec:** [`docs/superpowers/specs/2026-06-03-sidebar-detail-view-design.md`](../specs/2026-06-03-sidebar-detail-view-design.md)

**Conventions for every task:**
- Run a single test file with: `pnpm --filter <pkg> exec vitest run <path>` (client adds a CSS build automatically only on `pnpm --filter @airnauts/comments-client test`; for a single file use `pnpm --filter @airnauts/comments-client exec vitest run <path>`).
- Lint gate before any commit touching a package: `pnpm --filter <pkg> lint` is not always defined; the repo-wide gate is `pnpm lint` (biome). Run `pnpm lint` before each commit.
- Commit messages: imperative, and any change to a publishable package ships with a changeset (Tasks 5 and 21).

---

## File Structure

**Backend (contract):**
- `packages/core/src/schemas/thread.ts` — add `rootComment` to `ThreadListItem` (modify).
- `packages/core/src/schemas/thread.test.ts` — schema unit tests (modify).
- `packages/test-support/src/repository-contract.ts` — shared contract tests (modify).
- `packages/adapter-memory/src/in-memory.ts` — compute `rootComment` in `toListItem` (modify).
- `packages/adapter-mongo/src/repository.ts` — compute `rootComment` + widen list projection (modify).
- `.changeset/sidebar-rootcomment.md`, `docs/adr.md` — release + decision record (create/modify).

**Client — state:**
- `packages/client/src/panel/state.ts` — `view` + `detailThreadId` + `OPEN_DETAIL`/`BACK` (modify).
- `packages/client/src/panel/controller.ts` — `openDetail`/`back` (modify).
- `packages/client/src/drafts/state.ts` — new `drafts` slice (create).
- `packages/client/src/drafts/DraftsProvider.tsx` — provider + `useDraft` hook (create).
- `packages/client/src/panel/navigate.ts` — grow handoff payload (modify).
- `packages/client/src/config.ts` — `DEFAULT_THREAD_PARAM` (modify).

**Client — UI:**
- `packages/client/src/ui/Composer.tsx` — controllable text + attachment (modify).
- `packages/client/src/ui/ThreadConversation.tsx` — shared inner extracted from `ThreadCard` (create).
- `packages/client/src/ui/ThreadCard.tsx` — thin wrapper over `ThreadConversation` (modify) **or** deleted in favor of `ThreadConversation` used directly by `ThreadPopover`.
- `packages/client/src/ui/ThreadPopover.tsx` — render `ThreadConversation variant="popover"` (modify).
- `packages/client/src/panel/PanelRow.tsx` — root-comment preview + Reply/Resolve/Copy-link (modify).
- `packages/client/src/panel/PanelDrawer.tsx` — two-view rendering + Back header + detail (modify).
- `packages/client/src/marker/MarkerLayer.tsx` — open detail on `openDetail` handoff (modify).
- `packages/client/src/app/app.tsx` — mount `DraftsProvider` (modify).
- `packages/client/src/index.ts` — read/strip `?comments-thread` (modify).

**Docs + e2e:**
- `docs/ideas.md` — deferred backlog (create).
- `e2e/` — Playwright specs (create, mirroring the M10 harness).

---

## Phase A — Backend contract (`rootComment`), test-first

### Task 1: Add `rootComment` to the `ThreadListItem` schema

**Files:**
- Modify: `packages/core/src/schemas/thread.ts`
- Test: `packages/core/src/schemas/thread.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `packages/core/src/schemas/thread.test.ts` (inside the existing `describe`/file, alongside the current `ThreadListItem` tests):

```typescript
import { Thread, ThreadListItem } from './thread'

// ...existing `base` fixture used by the file...

it('ThreadListItem carries an optional rootComment preview', () => {
  const withRoot = ThreadListItem.parse({
    ...base,
    rootComment: { text: 'hello', createdAt: '2026-05-28T10:00:00.000Z' },
  })
  expect(withRoot.rootComment).toEqual({
    text: 'hello',
    createdAt: '2026-05-28T10:00:00.000Z',
  })

  // empty text == attachment-only root; null == degenerate no-comment thread
  expect(ThreadListItem.parse({ ...base, rootComment: { text: '', createdAt: base.createdAt } }).rootComment?.text).toBe('')
  expect(ThreadListItem.parse({ ...base, rootComment: null }).rootComment).toBeNull()
})
```

If the file's `base` fixture does not already include `rootComment`, add `rootComment: null` to it so the **other** existing `ThreadListItem.parse(base)` tests keep passing once the field is required.

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @airnauts/comments-core exec vitest run src/schemas/thread.test.ts`
Expected: FAIL — `rootComment` is stripped/unknown or `base` lacks a now-required field.

- [ ] **Step 3: Add the field to the schema**

In `packages/core/src/schemas/thread.ts`, change the `ThreadListItem` definition (leave `ThreadBase` and `Thread` untouched):

```typescript
export const ThreadListItem = ThreadBase.extend({
  rootComment: z
    .object({ text: z.string(), createdAt: IsoTimestamp })
    .nullable(),
}).meta({ id: 'ThreadListItem' })
export type ThreadListItem = z.infer<typeof ThreadListItem>
```

`IsoTimestamp` is already imported at the top of the file.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @airnauts/comments-core exec vitest run src/schemas/thread.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck the whole repo to find every now-broken `ThreadListItem` literal**

Run: `pnpm --filter @airnauts/comments-core build && pnpm -r typecheck`
Expected: type errors anywhere a `ThreadListItem` object literal is constructed without `rootComment` (the adapters — fixed in Tasks 3–4 — and any test fixtures). Note them; they are the work of the next tasks. Do not fix adapters yet.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/schemas/thread.ts packages/core/src/schemas/thread.test.ts
git commit -m "feat(core): add rootComment preview to ThreadListItem"
```

---

### Task 2: Add contract-suite tests for `rootComment` (red for both adapters)

**Files:**
- Modify: `packages/test-support/src/repository-contract.ts`

- [ ] **Step 1: Write the failing contract tests**

In `packages/test-support/src/repository-contract.ts`, inside the existing `describe('listThreads', ...)` block, add:

```typescript
it('projects the root comment text into rootComment', async () => {
  const input = makeNewThread({ firstComment: { text: 'the original' } })
  await repo.createThread(input)
  const result = await repo.listThreads({
    projectId: input.projectId,
    pageKey: input.pageKey ?? undefined,
    sort: 'updatedAt',
    limit: 50,
  })
  expect(result.threads[0]?.rootComment).toEqual({
    text: 'the original',
    createdAt: input.firstComment.createdAt,
  })
})

it('projects empty rootComment text for an attachment-only root', async () => {
  const input = makeNewThread({ firstComment: { text: '' } })
  await repo.createThread(input)
  const result = await repo.listThreads({
    projectId: input.projectId,
    pageKey: input.pageKey ?? undefined,
    sort: 'updatedAt',
    limit: 50,
  })
  expect(result.threads[0]?.rootComment?.text).toBe('')
})

it('keeps rootComment fixed to the first comment as replies are added', async () => {
  const input = makeNewThread({ firstComment: { text: 'first' } })
  await repo.createThread(input)
  await repo.addComment({ projectId: input.projectId }, input.id, makeComment({ text: 'a reply' }))
  const result = await repo.listThreads({
    projectId: input.projectId,
    pageKey: input.pageKey ?? undefined,
    sort: 'updatedAt',
    limit: 50,
  })
  expect(result.threads[0]?.rootComment?.text).toBe('first')
})
```

Then, inside the existing `describe('updateAnchor', ...)` block (the suite that exercises `repo.updateAnchor`), add a `rootComment` assertion. Mirror the style of the existing `updateAnchor` test that already returns a `ThreadListItem` — append:

```typescript
it('updateAnchor returns a ThreadListItem carrying rootComment', async () => {
  const input = makeNewThread({ firstComment: { text: 'anchored root' } })
  await repo.createThread(input)
  const item = await repo.updateAnchor(
    { projectId: input.projectId },
    input.id,
    { anchorState: 'orphaned' },
    '2026-05-28T11:00:00.000Z',
  )
  expect(item.rootComment?.text).toBe('anchored root')
})
```

If the existing `updateAnchor` tests construct the `AnchorPatch` differently (e.g. with `selectors`/`signals`), copy that exact call shape and only add the `rootComment` assertion.

- [ ] **Step 2: Run the memory adapter to verify it fails**

Run: `pnpm --filter @airnauts/comments-adapter-memory exec vitest run src/in-memory.test.ts`
Expected: FAIL — `rootComment` is `undefined` on the returned list items.

- [ ] **Step 3: Commit the spec**

```bash
git add packages/test-support/src/repository-contract.ts
git commit -m "test(test-support): contract spec for ThreadListItem.rootComment"
```

---

### Task 3: Make `adapter-memory` project `rootComment` (green for memory)

**Files:**
- Modify: `packages/adapter-memory/src/in-memory.ts:32-43`

- [ ] **Step 1: Compute `rootComment` in `toListItem`**

Replace the `toListItem` function:

```typescript
function toListItem(t: StoredThread): ThreadListItem {
  // Strip server-only scope + thread-only payload (comments/captureContext/provenance),
  // but first project the root (earliest) comment into the preview field.
  const root = t.comments[0]
  const {
    comments: _c,
    captureContext: _cc,
    provenance: _p,
    projectId: _pid,
    env: _env,
    ...rest
  } = t as StoredThread & Record<string, unknown>
  return {
    ...(rest as ThreadListItem),
    rootComment: root ? { text: root.text, createdAt: root.createdAt } : null,
  }
}
```

- [ ] **Step 2: Run the memory contract suite to verify it passes**

Run: `pnpm --filter @airnauts/comments-adapter-memory exec vitest run src/in-memory.test.ts`
Expected: PASS — including the three new `listThreads` tests and the `updateAnchor` test (memory's `updateAnchor` already routes through `toListItem`).

- [ ] **Step 3: Commit**

```bash
git add packages/adapter-memory/src/in-memory.ts
git commit -m "feat(adapter-memory): project rootComment into ThreadListItem"
```

---

### Task 4: Make `adapter-mongo` project `rootComment` (green for mongo)

**Files:**
- Modify: `packages/adapter-mongo/src/repository.ts:60-72` (toListItem) and `:124-130` (list projection)

- [ ] **Step 1: Widen the list projection to include the root comment**

In `listThreads`, change the projection so the first comment survives (`$slice` is allowed alongside exclusions):

```typescript
      const docs = await col
        .find(filter as Filter<StoredThread>, {
          projection: { comments: { $slice: 1 }, captureContext: 0, provenance: 0 },
        })
        .sort({ updatedAt: -1, _id: -1 })
        .limit(limit + 1)
        .toArray()
```

- [ ] **Step 2: Compute `rootComment` in `toListItem`**

Replace `toListItem`:

```typescript
function toListItem(doc: StoredThread): ThreadListItem {
  // The list projection slices comments to just the first (root); updateAnchor returns the
  // full doc. Either way comments[0] is the root. Strip the rest of the thread-only payload.
  const root = doc.comments?.[0]
  const {
    _id,
    projectId: _p,
    env: _e,
    comments: _c,
    captureContext: _cc,
    provenance: _pr,
    ...rest
  } = doc
  return {
    id: _id as ThreadId,
    ...rest,
    rootComment: root ? { text: root.text, createdAt: root.createdAt } : null,
  }
}
```

- [ ] **Step 3: Run the mongo contract suite to verify it passes**

Run: `pnpm --filter @airnauts/comments-adapter-mongo exec vitest run src/repository.test.ts`
Expected: PASS. (This requires the repo's usual Mongo test setup — run it the same way the existing mongo tests run in CI/local; if a `MONGODB_URI`/test container is needed, use the project's standard mechanism.)

- [ ] **Step 4: Typecheck server + next consume the field cleanly**

Run: `pnpm -r typecheck`
Expected: PASS — `server` and `next` only pass the contract through; no literal construction of `ThreadListItem` there.

- [ ] **Step 5: Commit**

```bash
git add packages/adapter-mongo/src/repository.ts
git commit -m "feat(adapter-mongo): project rootComment into ThreadListItem"
```

---

### Task 5: Changeset + ADR for the contract change

**Files:**
- Create: `.changeset/sidebar-rootcomment.md`
- Modify: `docs/adr.md`

- [ ] **Step 1: Write the changeset**

Create `.changeset/sidebar-rootcomment.md`:

```markdown
---
"@airnauts/comments-core": minor
"@airnauts/comments-adapter-memory": minor
"@airnauts/comments-adapter-mongo": minor
"@airnauts/comments-server": minor
"@airnauts/comments-next": minor
---

Thread list items now include a `rootComment` preview (the first comment's text and
timestamp), so list UIs can show what a thread is about without fetching the full thread.
```

(Pre-1.0 policy: additive feature → `minor`. See the `writing-changesets` skill.)

- [ ] **Step 2: Append an ADR**

Open `docs/adr.md`, find the highest existing `ADR-00NN`, and append a new record with the next sequential number, today's date (2026-06-03), status **accepted**:

- **Title:** "ThreadListItem carries a rootComment preview"
- **Context:** The cross-page panel needs to show each thread's initial message inline; `ThreadListItem` carried only counts/authors, forcing an N+1 of `getThread` per row.
- **Decision:** Add an additive, nullable `rootComment { text, createdAt }` to `ThreadListItem` (not `Thread`), projected by both adapters from `comments[0]` via the shared `toListItem`; mongo widens the list projection with `$slice: 1`.
- **Consequences:** One list request renders previews; empty `text` denotes an attachment-only root; pre-1.0 `minor` bump across core/adapters/server/next; `Thread` is unchanged so `getThread`/`createThread` paths are untouched.

- [ ] **Step 3: Commit**

```bash
git add .changeset/sidebar-rootcomment.md docs/adr.md
git commit -m "chore: changeset + ADR for ThreadListItem.rootComment"
```

---

## Phase B — Panel two-view state

### Task 6: Add `view` + `detailThreadId` to the panel reducer

**Files:**
- Modify: `packages/client/src/panel/state.ts`
- Test: `packages/client/src/panel/state.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `packages/client/src/panel/state.test.ts`:

```typescript
import { initialState, reducer } from './state'

describe('detail view', () => {
  it('starts on the list view', () => {
    expect(initialState.view).toBe('list')
    expect(initialState.detailThreadId).toBeNull()
  })

  it('OPEN_DETAIL switches to detail for a thread', () => {
    const s = reducer(initialState, { type: 'OPEN_DETAIL', id: 't1' })
    expect(s.view).toBe('detail')
    expect(s.detailThreadId).toBe('t1')
  })

  it('BACK returns to the list without dropping the loaded list', () => {
    const loaded = reducer(
      { ...initialState, list: [{ id: 'a' } as never], nextCursor: 'c1' },
      { type: 'OPEN_DETAIL', id: 'a' },
    )
    const s = reducer(loaded, { type: 'BACK' })
    expect(s.view).toBe('list')
    expect(s.detailThreadId).toBeNull()
    expect(s.list).toHaveLength(1)
    expect(s.nextCursor).toBe('c1')
  })

  it('CLOSE resets the view back to list', () => {
    const detail = reducer(initialState, { type: 'OPEN_DETAIL', id: 't1' })
    const s = reducer({ ...detail, open: true }, { type: 'CLOSE' })
    expect(s.open).toBe(false)
    expect(s.view).toBe('list')
    expect(s.detailThreadId).toBeNull()
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @airnauts/comments-client exec vitest run src/panel/state.test.ts`
Expected: FAIL — `view`/`detailThreadId` undefined; `OPEN_DETAIL`/`BACK` unhandled.

- [ ] **Step 3: Extend the state + reducer**

In `packages/client/src/panel/state.ts`:

Add the view type and fields:

```typescript
export type PanelView = 'list' | 'detail'

export type PanelState = {
  open: boolean
  view: PanelView
  detailThreadId: string | null
  filter: PanelFilter
  list: ThreadListItem[]
  nextCursor: string | null
  loading: boolean
  loadingMore: boolean
  error: boolean
  needsReview: ThreadListItem[]
}

export const initialState: PanelState = {
  open: false,
  view: 'list',
  detailThreadId: null,
  filter: 'open',
  list: [],
  nextCursor: null,
  loading: false,
  loadingMore: false,
  error: false,
  needsReview: [],
}
```

Add the two actions to the `Action` union:

```typescript
  | { type: 'OPEN_DETAIL'; id: string }
  | { type: 'BACK' }
```

Add the cases and update `CLOSE`:

```typescript
    case 'OPEN_DETAIL':
      return { ...state, view: 'detail', detailThreadId: action.id }
    case 'BACK':
      return { ...state, view: 'list', detailThreadId: null }
    case 'CLOSE':
      return { ...state, open: false, view: 'list', detailThreadId: null }
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter @airnauts/comments-client exec vitest run src/panel/state.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/panel/state.ts packages/client/src/panel/state.test.ts
git commit -m "feat(client): panel list/detail view state"
```

---

### Task 7: Expose `openDetail` / `back` on the panel controller

**Files:**
- Modify: `packages/client/src/panel/controller.ts`
- Test: `packages/client/src/panel/controller.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `packages/client/src/panel/controller.test.ts` (mirroring how existing tests build the controller with a mock dispatch + client):

```typescript
it('openDetail dispatches OPEN_DETAIL', () => {
  const dispatched: unknown[] = []
  const controller = createPanelController((a) => dispatched.push(a), {
    client: { listThreads: async () => ({ threads: [], nextCursor: null }) },
    getState: () => ({ ...initialState }),
  })
  controller.openDetail('t9')
  expect(dispatched).toContainEqual({ type: 'OPEN_DETAIL', id: 't9' })
})

it('back dispatches BACK', () => {
  const dispatched: unknown[] = []
  const controller = createPanelController((a) => dispatched.push(a), {
    client: { listThreads: async () => ({ threads: [], nextCursor: null }) },
    getState: () => ({ ...initialState }),
  })
  controller.back()
  expect(dispatched).toContainEqual({ type: 'BACK' })
})
```

Import `initialState` from `./state` at the top of the test if not already imported.

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @airnauts/comments-client exec vitest run src/panel/controller.test.ts`
Expected: FAIL — `openDetail`/`back` are not on the controller.

- [ ] **Step 3: Add the methods**

In `packages/client/src/panel/controller.ts`, add to the `PanelController` type:

```typescript
  openDetail(id: string): void
  back(): void
```

And to the returned object (alongside `closePanel`):

```typescript
    openDetail(id) {
      dispatch({ type: 'OPEN_DETAIL', id })
    },
    back() {
      dispatch({ type: 'BACK' })
    },
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter @airnauts/comments-client exec vitest run src/panel/controller.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/panel/controller.ts packages/client/src/panel/controller.test.ts
git commit -m "feat(client): panel controller openDetail/back"
```

---

## Phase C — Shared drafts slice

### Task 8: Create the `drafts` store + `useDraft` hook

**Files:**
- Create: `packages/client/src/drafts/state.ts`
- Create: `packages/client/src/drafts/DraftsProvider.tsx`
- Test: `packages/client/src/drafts/DraftsProvider.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `packages/client/src/drafts/DraftsProvider.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import type { Attachment } from '@airnauts/comments-core'
import { DraftsProvider, useDraft } from './DraftsProvider'

const ATT = { id: 'a1', url: 'https://x/y.png', name: 'y.png', contentType: 'image/png', size: 1 } as Attachment

function Surface({ id, label }: { id: string; label: string }) {
  const { draft, setText, setAttachment, clear } = useDraft(id)
  return (
    <div>
      <span data-testid={`${label}-text`}>{draft.text}</span>
      <span data-testid={`${label}-att`}>{draft.attachment?.id ?? 'none'}</span>
      <button type="button" onClick={() => setText(`hi from ${label}`)}>{`type-${label}`}</button>
      <button type="button" onClick={() => setAttachment(ATT)}>{`attach-${label}`}</button>
      <button type="button" onClick={clear}>{`clear-${label}`}</button>
    </div>
  )
}

describe('drafts slice', () => {
  it('mirrors text and attachment between two surfaces on the same thread', async () => {
    const user = userEvent.setup()
    render(
      <DraftsProvider>
        <Surface id="t1" label="a" />
        <Surface id="t1" label="b" />
      </DraftsProvider>,
    )
    await user.click(screen.getByText('type-a'))
    expect(screen.getByTestId('b-text').textContent).toBe('hi from a')
    await user.click(screen.getByText('attach-b'))
    expect(screen.getByTestId('a-att').textContent).toBe('a1')
  })

  it('clear empties text and attachment for that thread only', async () => {
    const user = userEvent.setup()
    render(
      <DraftsProvider>
        <Surface id="t1" label="a" />
        <Surface id="t2" label="c" />
      </DraftsProvider>,
    )
    await user.click(screen.getByText('type-a'))
    await user.click(screen.getByText('type-c'))
    await user.click(screen.getByText('clear-a'))
    expect(screen.getByTestId('a-text').textContent).toBe('')
    expect(screen.getByTestId('c-text').textContent).toBe('hi from c')
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @airnauts/comments-client exec vitest run src/drafts/DraftsProvider.test.tsx`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement the slice**

Create `packages/client/src/drafts/state.ts`:

```typescript
import type { Attachment } from '@airnauts/comments-core'

export type Draft = { text: string; attachment: Attachment | null }

export const EMPTY_DRAFT: Draft = { text: '', attachment: null }

export type DraftsState = Record<string, Draft>

export type DraftAction =
  | { type: 'SET_TEXT'; id: string; text: string }
  | { type: 'SET_ATTACHMENT'; id: string; attachment: Attachment | null }
  | { type: 'CLEAR'; id: string }

function patch(state: DraftsState, id: string, next: Partial<Draft>): DraftsState {
  const current = state[id] ?? EMPTY_DRAFT
  return { ...state, [id]: { ...current, ...next } }
}

export function draftsReducer(state: DraftsState, action: DraftAction): DraftsState {
  switch (action.type) {
    case 'SET_TEXT':
      return patch(state, action.id, { text: action.text })
    case 'SET_ATTACHMENT':
      return patch(state, action.id, { attachment: action.attachment })
    case 'CLEAR': {
      const { [action.id]: _gone, ...rest } = state
      return rest
    }
    default:
      return state
  }
}
```

- [ ] **Step 4: Implement the provider + hook**

Create `packages/client/src/drafts/DraftsProvider.tsx`:

```tsx
import { createContext, type ReactNode, useContext, useMemo, useReducer } from 'react'
import type { Attachment } from '@airnauts/comments-core'
import { type Draft, draftsReducer, type DraftsState, EMPTY_DRAFT } from './state'

type DraftsContextValue = { state: DraftsState; dispatch: (a: Parameters<typeof draftsReducer>[1]) => void }

const DraftsContext = createContext<DraftsContextValue | null>(null)

export function DraftsProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(draftsReducer, {} as DraftsState)
  const value = useMemo(() => ({ state, dispatch }), [state])
  return <DraftsContext.Provider value={value}>{children}</DraftsContext.Provider>
}

export function useDraft(id: string): {
  draft: Draft
  setText: (text: string) => void
  setAttachment: (attachment: Attachment | null) => void
  clear: () => void
} {
  const ctx = useContext(DraftsContext)
  if (!ctx) throw new Error('useDraft must be used within <DraftsProvider>')
  const { state, dispatch } = ctx
  const draft = state[id] ?? EMPTY_DRAFT
  return useMemo(
    () => ({
      draft,
      setText: (text) => dispatch({ type: 'SET_TEXT', id, text }),
      setAttachment: (attachment) => dispatch({ type: 'SET_ATTACHMENT', id, attachment }),
      clear: () => dispatch({ type: 'CLEAR', id }),
    }),
    [draft, dispatch, id],
  )
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `pnpm --filter @airnauts/comments-client exec vitest run src/drafts/DraftsProvider.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/client/src/drafts/
git commit -m "feat(client): per-thread drafts slice with useDraft hook"
```

---

### Task 9: Make `Composer` controllable over text + stored attachment

**Files:**
- Modify: `packages/client/src/ui/Composer.tsx`
- Test: `packages/client/src/ui/Composer.test.tsx`

- [ ] **Step 1: Write the failing test**

Add to `packages/client/src/ui/Composer.test.tsx` (reuse the file's existing helpers/mocks for `identity`, `onNeedIdentity`, `upload`, `onSubmit`):

```tsx
it('is controlled over text when value/onValueChange are provided', async () => {
  const user = userEvent.setup()
  const onValueChange = vi.fn()
  render(
    <Composer
      mode="reply"
      identity={{ email: 'a@b.c' }}
      onNeedIdentity={() => {}}
      onSubmit={async () => {}}
      upload={async () => ({}) as never}
      value="seed"
      onValueChange={onValueChange}
    />,
  )
  const input = screen.getByLabelText('Reply…') as HTMLInputElement
  expect(input.value).toBe('seed')
  await user.type(input, '!')
  expect(onValueChange).toHaveBeenCalledWith('seed!')
})

it('clears via onValueChange/onAttachmentChange after a successful send', async () => {
  const user = userEvent.setup()
  const onValueChange = vi.fn()
  const onAttachmentChange = vi.fn()
  render(
    <Composer
      mode="reply"
      identity={{ email: 'a@b.c' }}
      onNeedIdentity={() => {}}
      onSubmit={async () => {}}
      upload={async () => ({}) as never}
      value="hello"
      onValueChange={onValueChange}
      attachment={null}
      onAttachmentChange={onAttachmentChange}
    />,
  )
  await user.click(screen.getByText('Send'))
  expect(onValueChange).toHaveBeenLastCalledWith('')
  expect(onAttachmentChange).toHaveBeenLastCalledWith(null)
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @airnauts/comments-client exec vitest run src/ui/Composer.test.tsx`
Expected: FAIL — props unknown; text not controlled; clear hits local state only.

- [ ] **Step 3: Make the Composer controllable**

In `packages/client/src/ui/Composer.tsx`:

Extend the props type:

```typescript
export type ComposerProps = {
  mode: 'newThread' | 'reply'
  identity: Identity | null
  onNeedIdentity: (resume: (who: Identity) => void) => void
  onSubmit: (payload: ComposerSubmit) => Promise<void>
  upload: (file: File) => Promise<Attachment>
  onCancel?: () => void
  autoFocus?: boolean
  /** Controlled text. When provided, the parent owns the draft text (shared-draft sync). */
  value?: string
  onValueChange?: (text: string) => void
  /** Controlled stored attachment (after upload). When `onAttachmentChange` is provided,
   *  a completed upload is lifted to the parent and rendered from `attachment.url`. */
  attachment?: Attachment | null
  onAttachmentChange?: (attachment: Attachment | null) => void
}
```

Inside the component, derive controlled text and a controlled-attachment flag:

```typescript
  const [internalText, setInternalText] = useState('')
  const textControlled = value !== undefined
  const text = textControlled ? value : internalText
  const setText = (next: string) => {
    if (textControlled) onValueChange?.(next)
    else setInternalText(next)
  }
  const attControlled = onAttachmentChange !== undefined
```

(Remove the old `const [text, setText] = useState('')` line; add `value, onValueChange, attachment, onAttachmentChange` to the destructured props.)

Update `hasContent` to count a controlled stored attachment:

```typescript
  const readyAttachment = attControlled ? (attachment ?? null) : null
  const hasContent =
    text.trim().length > 0 || pending?.status === 'ready' || readyAttachment !== null
```

When an upload completes, lift it to the parent and drop the local pending (so both surfaces render the stored attachment from its server URL):

```typescript
  function startUpload(file: File) {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
    const previewUrl = URL.createObjectURL(file)
    previewUrlRef.current = previewUrl
    setPending({ name: file.name, status: 'uploading', file, previewUrl })
    upload(file)
      .then((att) => {
        if (attControlled) {
          onAttachmentChange?.(att)
          clearPending() // server URL now drives the thumbnail in both surfaces
        } else {
          setPending((p) => (p && p.file === file ? { ...p, status: 'ready', id: att.id } : p))
        }
      })
      .catch(() => setPending((p) => (p && p.file === file ? { ...p, status: 'error' } : p)))
  }
```

Update `doSend` to use the controlled attachment and clear the right place:

```typescript
  function doSend(who: Identity) {
    const attachmentIds = attControlled
      ? readyAttachment
        ? [readyAttachment.id]
        : []
      : pending?.id
        ? [pending.id]
        : []
    setSending(true)
    onSubmit({ text: text.trim(), attachmentIds, who })
      .then(() => {
        setText('')
        if (attControlled) onAttachmentChange?.(null)
        else clearPending()
      })
      .catch(() => {
        /* caller surfaces the error (toast); keep the draft so the user can retry */
      })
      .finally(() => setSending(false))
  }
```

Render the stored (controlled) attachment as a removable thumbnail using the existing `PendingAttachment` with `status="ready"`, when there is no in-flight `pending`:

```tsx
      {pending && (
        <PendingAttachment
          name={pending.name}
          status={pending.status}
          previewUrl={pending.previewUrl}
          onRemove={clearPending}
          onRetry={() => startUpload(pending.file)}
        />
      )}
      {!pending && readyAttachment && (
        <PendingAttachment
          name={readyAttachment.name}
          status="ready"
          previewUrl={readyAttachment.url}
          onRemove={() => onAttachmentChange?.(null)}
          onRetry={() => {}}
        />
      )}
```

Bind the input to `text`/`setText`:

```tsx
        <input
          ref={inputRef}
          aria-label={placeholder}
          placeholder={placeholder}
          value={text}
          onChange={(e) => setText(e.target.value)}
          /* ...keep the existing onKeyDown + className... */
        />
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter @airnauts/comments-client exec vitest run src/ui/Composer.test.tsx`
Expected: PASS — including the file's existing uncontrolled tests (the `value === undefined` path is unchanged).

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/ui/Composer.tsx packages/client/src/ui/Composer.test.tsx
git commit -m "feat(client): make Composer controllable over text + stored attachment"
```

---

## Phase D — Conversation extraction, draft wiring, detail view

### Task 10: Extract `ThreadConversation` from `ThreadCard`

**Files:**
- Create: `packages/client/src/ui/ThreadConversation.tsx`
- Modify: `packages/client/src/ui/ThreadPopover.tsx`
- Modify/Delete: `packages/client/src/ui/ThreadCard.tsx`
- Test: `packages/client/src/ui/ThreadConversation.test.tsx` (rename/extend the existing `ThreadCard`/`ThreadPopover` tests)

- [ ] **Step 1: Create `ThreadConversation` with the current `ThreadCard` body + a `variant` prop**

Create `packages/client/src/ui/ThreadConversation.tsx`. This is the existing `ThreadCard` implementation verbatim (the optimistic `submitReply`, `toggleStatus`, header, `CommentList`, `Composer`), with two additions: a `variant: 'popover' | 'sidebar'` prop that selects the wrapper width, and (in the `sidebar` variant) a page-context box above the comment list. Keep all `cmnt:` classes from `ThreadCard`.

```tsx
import type { AttachmentId, Comment, ThreadListItem } from '@airnauts/comments-core'
import type { ApiClient } from '../api/client'
import type { Identity } from '../identity/storage'
import { cn } from '../lib/cn'
import { useController, useDispatch, useOpenThread } from '../threads/useThreads'
import { CommentList } from './CommentList'
import { Composer, type ComposerSubmit } from './Composer'
import { useToast } from './toast'

let nextTempId = 0

export type ThreadConversationProps = {
  item: ThreadListItem
  client: Pick<ApiClient, 'getThread' | 'addComment' | 'setThreadStatus' | 'upload'>
  identity: Identity | null
  onNeedIdentity: (resume: (who: Identity) => void) => void
  variant: 'popover' | 'sidebar'
  /** Controlled draft text (shared-draft sync). */
  draftText?: string
  onDraftTextChange?: (text: string) => void
  draftAttachment?: import('@airnauts/comments-core').Attachment | null
  onDraftAttachmentChange?: (a: import('@airnauts/comments-core').Attachment | null) => void
}

export function ThreadConversation({
  item,
  client,
  identity,
  onNeedIdentity,
  variant,
  draftText,
  onDraftTextChange,
  draftAttachment,
  onDraftAttachmentChange,
}: ThreadConversationProps) {
  const id = item.id
  const controller = useController()
  const dispatch = useDispatch()
  const { detail, loading, error } = useOpenThread()
  const toast = useToast()
  const resolved = (detail?.status ?? item.status) === 'resolved'

  async function submitReply({ text, attachmentIds, who }: ComposerSubmit) {
    const tempId = `temp-${nextTempId++}`
    const optimistic = {
      id: tempId,
      author: { email: who.email, name: who.name },
      text,
      attachments: [],
      createdAt: new Date().toISOString(),
    } as unknown as Comment
    dispatch({ type: 'ADD_OPTIMISTIC_COMMENT', id, comment: optimistic })
    const wasResolved = resolved
    if (wasResolved) controller.patchStatus(id, 'open')
    let saved: Comment
    try {
      saved = await client.addComment(id, {
        text,
        attachmentIds: attachmentIds as AttachmentId[],
        author: { email: who.email, name: who.name },
      })
    } catch {
      dispatch({ type: 'REMOVE_OPTIMISTIC_COMMENT', id, tempId })
      if (wasResolved) controller.patchStatus(id, 'resolved')
      toast('Failed to post reply')
      return
    }
    dispatch({ type: 'REPLACE_OPTIMISTIC_COMMENT', id, tempId, comment: saved })
    if (wasResolved) {
      try {
        await client.setThreadStatus(id, { status: 'open' })
      } catch {
        controller.patchStatus(id, 'resolved')
        toast('Reply posted, but reopening the thread failed')
      }
    }
  }

  async function toggleStatus() {
    const next = resolved ? 'open' : 'resolved'
    const ok = await controller.setStatus(id, next)
    if (!ok) toast(`Failed to ${next === 'resolved' ? 'resolve' : 'reopen'} thread`)
  }

  const wrapper =
    variant === 'popover'
      ? 'cmnt:w-80 cmnt:max-w-[calc(100vw-16px)] cmnt:bg-white cmnt:border cmnt:border-gray-200 cmnt:rounded-xl cmnt:overflow-hidden cmnt:text-[13px] cmnt:text-gray-900 cmnt:shadow-[0_12px_32px_rgba(0,0,0,0.18)]'
      : 'cmnt:w-full cmnt:bg-white cmnt:text-[13px] cmnt:text-gray-900 cmnt:flex cmnt:flex-col cmnt:min-h-0 cmnt:flex-1'

  return (
    <div className={wrapper}>
      <div
        className={cn(
          'cmnt:flex cmnt:items-center cmnt:justify-between cmnt:px-3 cmnt:py-2.5 cmnt:border-b cmnt:border-[#f1f3f5]',
          resolved && 'cmnt:bg-[#f7fdf9]',
        )}
      >
        <span
          className={cn(
            'cmnt:text-[11px] cmnt:font-semibold',
            resolved ? 'cmnt:text-green-600' : 'cmnt:text-blue-600',
          )}
        >
          {resolved
            ? '✓ Resolved'
            : `Open · ${item.commentCount} ${item.commentCount === 1 ? 'comment' : 'comments'}`}
        </span>
        <div className="cmnt:flex cmnt:items-center cmnt:gap-1.5 cmnt:text-gray-500">
          <button
            type="button"
            onClick={toggleStatus}
            className={cn(
              'cmnt:border cmnt:border-gray-300 cmnt:rounded-md cmnt:px-2 cmnt:py-[3px] cmnt:text-[11px] cmnt:font-semibold cmnt:bg-white cmnt:cursor-pointer',
              resolved ? 'cmnt:text-gray-500' : 'cmnt:text-green-600',
            )}
          >
            {resolved ? '↺ Reopen' : '✓ Resolve'}
          </button>
          {variant === 'popover' && (
            <button
              type="button"
              aria-label="Close"
              onClick={() => controller.close()}
              className="cmnt:border-none cmnt:bg-transparent cmnt:cursor-pointer cmnt:px-1.5 cmnt:py-0.5"
            >
              ✕
            </button>
          )}
        </div>
      </div>
      {variant === 'sidebar' && (
        <div className="cmnt:mx-3 cmnt:mt-2 cmnt:px-3 cmnt:py-2 cmnt:rounded-lg cmnt:bg-gray-50 cmnt:border cmnt:border-gray-200">
          <div className="cmnt:text-[13px] cmnt:font-semibold cmnt:text-gray-900 cmnt:truncate">
            {item.pageTitle ?? item.pageUrl}
          </div>
          <div className="cmnt:text-[11px] cmnt:text-gray-500 cmnt:truncate">{item.pageUrl}</div>
        </div>
      )}
      <CommentList
        comments={detail?.comments ?? []}
        loading={loading}
        error={error}
        onRetry={() => controller.openThread(id)}
      />
      {!loading && (
        <Composer
          mode="reply"
          identity={identity}
          onNeedIdentity={onNeedIdentity}
          onSubmit={submitReply}
          upload={client.upload}
          value={draftText}
          onValueChange={onDraftTextChange}
          attachment={draftAttachment}
          onAttachmentChange={onDraftAttachmentChange}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 2: Point `ThreadPopover` at `ThreadConversation`**

In `packages/client/src/ui/ThreadPopover.tsx`, replace the `ThreadCard` import and usage with `ThreadConversation` at `variant="popover"`. Leave drafts unwired for now (Task 11 adds them):

```tsx
import { ThreadConversation } from './ThreadConversation'
// ...
          <ThreadConversation
            item={item}
            client={client}
            identity={identity}
            onNeedIdentity={onNeedIdentity}
            variant="popover"
          />
```

- [ ] **Step 3: Delete `ThreadCard` (or leave a re-export) and update its test**

Delete `packages/client/src/ui/ThreadCard.tsx`. Rename `packages/client/src/ui/ThreadCard.test.tsx` → `ThreadConversation.test.tsx`, import `ThreadConversation`, and pass `variant="popover"` so the existing reply/resolve assertions still hold. If `ThreadPopover.test.tsx` imports `ThreadCard`, update it to `ThreadConversation`.

- [ ] **Step 4: Run the affected tests**

Run: `pnpm --filter @airnauts/comments-client exec vitest run src/ui/ThreadConversation.test.tsx src/ui/ThreadPopover.test.tsx`
Expected: PASS — popover behavior is unchanged by the extraction.

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/ui/ThreadConversation.tsx packages/client/src/ui/ThreadPopover.tsx packages/client/src/ui/ThreadConversation.test.tsx
git rm packages/client/src/ui/ThreadCard.tsx packages/client/src/ui/ThreadCard.test.tsx 2>/dev/null; true
git commit -m "refactor(client): extract ThreadConversation from ThreadCard"
```

---

### Task 11: Wire both surfaces to the shared draft

**Files:**
- Modify: `packages/client/src/ui/ThreadPopover.tsx`
- Test: `packages/client/src/ui/ThreadConversation.test.tsx`

- [ ] **Step 1: Write the failing test (draft sync across surfaces)**

Add to `packages/client/src/ui/ThreadConversation.test.tsx`. Render two `ThreadConversation`s for the same `item.id` inside one `DraftsProvider` (plus the existing Threads/Toast providers the test already sets up), each reading `useDraft(item.id)`:

```tsx
import { DraftsProvider, useDraft } from '../drafts/DraftsProvider'

function Wired({ variant }: { variant: 'popover' | 'sidebar' }) {
  const d = useDraft('t1')
  return (
    <ThreadConversation
      item={makeItem('t1')}  // use the test's existing item factory; id 't1'
      client={mockClient}
      identity={{ email: 'a@b.c' }}
      onNeedIdentity={() => {}}
      variant={variant}
      draftText={d.draft.text}
      onDraftTextChange={d.setText}
      draftAttachment={d.draft.attachment}
      onDraftAttachmentChange={d.setAttachment}
    />
  )
}

it('mirrors composer text between popover and sidebar for the same thread', async () => {
  const user = userEvent.setup()
  renderWithProviders(   // the test's existing provider wrapper, wrapped again in <DraftsProvider>
    <DraftsProvider>
      <Wired variant="popover" />
      <Wired variant="sidebar" />
    </DraftsProvider>,
  )
  const inputs = screen.getAllByLabelText('Reply…') as HTMLInputElement[]
  await user.type(inputs[0], 'shared text')
  expect(inputs[1].value).toBe('shared text')
})
```

Use the test file's existing `mockClient`/item factory/provider helpers; only the `DraftsProvider` wrapper and the controlled props are new.

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @airnauts/comments-client exec vitest run src/ui/ThreadConversation.test.tsx`
Expected: FAIL — without wiring, the two inputs do not mirror.

- [ ] **Step 3: Wire the popover surface to `useDraft`**

In `packages/client/src/ui/ThreadPopover.tsx`, read the draft and pass it down:

```tsx
import { useDraft } from '../drafts/DraftsProvider'
// inside the component, after `const id = item.id`:
  const draft = useDraft(id)
// in the JSX:
          <ThreadConversation
            item={item}
            client={client}
            identity={identity}
            onNeedIdentity={onNeedIdentity}
            variant="popover"
            draftText={draft.draft.text}
            onDraftTextChange={draft.setText}
            draftAttachment={draft.draft.attachment}
            onDraftAttachmentChange={draft.setAttachment}
          />
```

(The sidebar surface is wired the same way in Task 12. After a successful reply, the Composer already calls `onValueChange('')` + `onAttachmentChange(null)`, which clears the shared slice for that thread.)

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter @airnauts/comments-client exec vitest run src/ui/ThreadConversation.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/ui/ThreadPopover.tsx packages/client/src/ui/ThreadConversation.test.tsx
git commit -m "feat(client): sync pin-popover composer to the shared draft"
```

---

### Task 12: Render the detail view + root-comment list cards in the panel

**Files:**
- Modify: `packages/client/src/panel/PanelRow.tsx`
- Modify: `packages/client/src/panel/PanelDrawer.tsx`
- Test: `packages/client/src/panel/PanelRow.test.tsx`, `packages/client/src/panel/PanelDrawer.test.tsx`

- [ ] **Step 1: Write the failing PanelRow test**

Add to `packages/client/src/panel/PanelRow.test.tsx` (the test file builds a `ThreadListItem`; add `rootComment` to its fixture builder, defaulting to `{ text: 'root msg', createdAt: '...' }`):

```tsx
it('shows the root comment text and a reply count', () => {
  render(<PanelRow item={makeItem({ commentCount: 3, rootComment: { text: 'root msg', createdAt: ISO } })} onSelect={() => {}} onReply={() => {}} />)
  expect(screen.getByText('root msg')).toBeInTheDocument()
  expect(screen.getByText('2 Replies')).toBeInTheDocument()
})

it('shows a Reply affordance when there are no replies', () => {
  render(<PanelRow item={makeItem({ commentCount: 1, rootComment: { text: 'solo', createdAt: ISO } })} onSelect={() => {}} onReply={() => {}} />)
  expect(screen.getByRole('button', { name: /reply/i })).toBeInTheDocument()
})

it('renders an attachment placeholder when the root text is empty', () => {
  render(<PanelRow item={makeItem({ commentCount: 1, rootComment: { text: '', createdAt: ISO } })} onSelect={() => {}} onReply={() => {}} />)
  expect(screen.getByText(/attachment/i)).toBeInTheDocument()
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @airnauts/comments-client exec vitest run src/panel/PanelRow.test.tsx`
Expected: FAIL — no root text rendered; no `onReply` prop.

- [ ] **Step 3: Update `PanelRow` to show the root comment + Reply/N-Replies**

Rewrite `packages/client/src/panel/PanelRow.tsx`:

```tsx
import type { ThreadListItem } from '@airnauts/comments-core'
import { cn } from '../lib/cn'
import { relativeTime } from '../threads/relativeTime'
import { avatarColor, initials } from '../ui/avatar'

export type PanelRowProps = {
  item: ThreadListItem
  onSelect: () => void
  onReply: () => void
}

export function PanelRow({ item, onSelect, onReply }: PanelRowProps) {
  const resolved = item.status === 'resolved'
  const orphaned = item.anchorState === 'orphaned'
  const replies = Math.max(0, item.commentCount - 1)
  const rootText = item.rootComment?.text ?? ''
  const author = item.createdBy

  return (
    <div
      data-testid="comments-panel-row"
      data-thread-id={item.id}
      className="cmnt:border-b cmnt:border-[#f1f3f5]"
    >
      <button
        type="button"
        onClick={onSelect}
        aria-label={`Open thread on ${item.pageTitle ?? item.pageUrl}`}
        className="cmnt:w-full cmnt:flex cmnt:items-start cmnt:gap-2 cmnt:px-3 cmnt:py-2.5 cmnt:text-left cmnt:bg-transparent cmnt:border-0 cmnt:cursor-pointer cmnt:hover:bg-gray-50"
      >
        <span
          aria-hidden
          className="cmnt:shrink-0 cmnt:w-[26px] cmnt:h-[26px] cmnt:rounded-full cmnt:text-white cmnt:flex cmnt:items-center cmnt:justify-center cmnt:text-[11px] cmnt:font-semibold"
          style={{ backgroundColor: avatarColor(author.email) }}
        >
          {initials(author)}
        </span>
        <span className="cmnt:flex-1 cmnt:min-w-0">
          <span className="cmnt:flex cmnt:items-center cmnt:gap-1.5">
            <b className="cmnt:text-xs cmnt:truncate">{author.name ?? author.email}</b>
            <span className="cmnt:text-gray-400 cmnt:text-[11px]">{relativeTime(item.updatedAt)}</span>
            {orphaned && (
              <span className="cmnt:ml-1 cmnt:px-1.5 cmnt:py-0.5 cmnt:rounded cmnt:bg-amber-100 cmnt:text-amber-700 cmnt:font-medium cmnt:text-[11px]">
                <span aria-hidden>⚠</span> anchor lost
              </span>
            )}
          </span>
          <span className="cmnt:mt-0.5 cmnt:block cmnt:text-[13px] cmnt:text-gray-900 cmnt:truncate">
            {rootText !== '' ? rootText : <span className="cmnt:text-gray-400">📎 Attachment</span>}
          </span>
        </span>
      </button>
      <div className="cmnt:px-3 cmnt:pb-2 cmnt:pl-[46px]">
        {replies > 0 ? (
          <button
            type="button"
            onClick={onSelect}
            className="cmnt:bg-transparent cmnt:border-0 cmnt:p-0 cmnt:text-[11px] cmnt:font-medium cmnt:text-gray-500 cmnt:cursor-pointer cmnt:hover:underline"
          >
            {replies} {replies === 1 ? 'Reply' : 'Replies'}
          </button>
        ) : (
          <button
            type="button"
            onClick={onReply}
            className="cmnt:bg-transparent cmnt:border-0 cmnt:p-0 cmnt:text-[11px] cmnt:font-medium cmnt:text-blue-600 cmnt:cursor-pointer cmnt:hover:underline"
          >
            Reply
          </button>
        )}
      </div>
    </div>
  )
}
```

(`resolved` is retained for the existing dot if needed; if biome flags it as unused, drop it.)

- [ ] **Step 4: Run PanelRow tests to verify they pass**

Run: `pnpm --filter @airnauts/comments-client exec vitest run src/panel/PanelRow.test.tsx`
Expected: PASS.

- [ ] **Step 5: Write the failing PanelDrawer detail-view test**

Add to `packages/client/src/panel/PanelDrawer.test.tsx` (reuse its existing render harness with Threads/Panel/Drafts/Toast providers; ensure `DraftsProvider` wraps the drawer):

```tsx
it('shows the detail view with a Back button after selecting a same-page row', async () => {
  const user = userEvent.setup()
  renderDrawerOpen({ rows: [makeItem({ id: 't1', pageKey: HERE })] })
  await user.click(screen.getByTestId('comments-panel-row'))
  expect(screen.getByRole('button', { name: /back/i })).toBeInTheDocument()
  // list filters are hidden in detail view:
  expect(screen.queryByRole('button', { name: 'Open' })).not.toBeInTheDocument()
})

it('Back returns to the list', async () => {
  const user = userEvent.setup()
  renderDrawerOpen({ rows: [makeItem({ id: 't1', pageKey: HERE })] })
  await user.click(screen.getByTestId('comments-panel-row'))
  await user.click(screen.getByRole('button', { name: /back/i }))
  expect(screen.getByTestId('comments-panel-row')).toBeInTheDocument()
})
```

`HERE` is the page key that `resolvePageKey(window.location.href)` returns in the test (the file already stubs this for the existing same-page selection test — reuse it).

- [ ] **Step 6: Run to verify it fails**

Run: `pnpm --filter @airnauts/comments-client exec vitest run src/panel/PanelDrawer.test.tsx`
Expected: FAIL — no Back button; detail view not rendered.

- [ ] **Step 7: Render the two views in `PanelDrawer`**

In `packages/client/src/panel/PanelDrawer.tsx`:

Add imports:

```tsx
import { useDraft } from '../drafts/DraftsProvider'
import { ThreadConversation } from '../ui/ThreadConversation'
import { useOpenThread } from '../threads/useThreads'
```

`PanelDrawer` needs the same `client`/`identity`/`onNeedIdentity` that the popover uses, so the sidebar detail can render `ThreadConversation`. Add them to `PanelDrawerProps`:

```tsx
export type PanelDrawerProps = {
  resolvePageKey: (url: string) => string
  client: Pick<ApiClient, 'getThread' | 'addComment' | 'setThreadStatus' | 'upload'>
  identity: Identity | null
  onNeedIdentity: (resume: (who: Identity) => void) => void
}
```

(Thread the new props from `app.tsx` — see Task 17 / mounting; `app.tsx` already has `client`, `identity`, `onNeedIdentity` in scope where `<PanelDrawer .../>` is rendered.)

Change `onSelect` (this is the same-page side of Task 16; cross-page is finalized there) and add an `onReply`:

```tsx
  function onSelect(row: { id: string; pageKey: string | null; pageUrl: string }) {
    const here = resolvePageKey(window.location.href)
    if (row.pageKey === here) {
      panel.openDetail(row.id)
      threads.openThread(row.id)
      threads.requestFocus(row.id)
    } else {
      goToThread({ id: row.id, pageUrl: row.pageUrl, openDetail: true })
    }
  }
```

Render the detail view when `state.view === 'detail'`. A `DetailView` sub-component (in the same file) reads the open thread's `item` and wires the shared draft:

```tsx
function DetailView({
  threadId,
  client,
  identity,
  onNeedIdentity,
  onBack,
}: {
  threadId: string
  client: PanelDrawerProps['client']
  identity: Identity | null
  onNeedIdentity: PanelDrawerProps['onNeedIdentity']
  onBack: () => void
}) {
  const { detail } = useOpenThread()
  const draft = useDraft(threadId)
  // Prefer the loaded detail as the source for the header item; fall back to a minimal item.
  const item = (detail as unknown as ThreadListItem | null)
  return (
    <>
      <div className="cmnt:flex cmnt:items-center cmnt:justify-between cmnt:px-2 cmnt:py-2 cmnt:border-b cmnt:border-gray-200">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back"
          className="cmnt:flex cmnt:items-center cmnt:gap-1 cmnt:bg-transparent cmnt:border-0 cmnt:cursor-pointer cmnt:text-sm cmnt:text-gray-700 cmnt:px-1"
        >
          <span aria-hidden>‹</span> Back
        </button>
      </div>
      <div className="cmnt:flex-1 cmnt:overflow-y-auto cmnt:flex cmnt:flex-col">
        {item && (
          <ThreadConversation
            item={item}
            client={client}
            identity={identity}
            onNeedIdentity={onNeedIdentity}
            variant="sidebar"
            draftText={draft.draft.text}
            onDraftTextChange={draft.setText}
            draftAttachment={draft.draft.attachment}
            onDraftAttachmentChange={draft.setAttachment}
          />
        )}
      </div>
    </>
  )
}
```

In the `Dialog.Content`, branch on the view: render the existing header/filters/list **only** when `state.view === 'list'`, and render `<DetailView .../>` (with `<Dialog.Title className="cmnt:sr-only">Thread</Dialog.Title>` for a11y) when `state.view === 'detail' && state.detailThreadId`. Pass `onBack={() => panel.back()}`. Each `PanelRow` now passes `onReply={() => onSelect(t)}` in addition to `onSelect={() => onSelect(t)}` (Reply and tapping the card both open the detail; the detail's composer is the reply surface). **Both** `PanelRow` render sites — the main list **and** the `needsReview` section — must pass the new props (`onReply`, plus `onResolve` from Task 13); since they are required props, `pnpm -r typecheck` (Task 19) will flag any site you miss.

> Note on the `item` source: in same-page selection the detail's `getThread` is in flight, so the `ThreadConversation` header reads from `detail`. To always have an `item` immediately, prefer reading it from the panel list (`state.list`/`state.needsReview`) by `detailThreadId`; if not present (cross-page boot), fall back to `detail`. Implement `item` as: `state.list.find(t => t.id === threadId) ?? state.needsReview.find(...) ?? (detail as ThreadListItem | null)`. Pass `state` into `DetailView` or compute `item` in `PanelDrawer` and pass it down.

- [ ] **Step 8: Run PanelDrawer tests to verify they pass**

Run: `pnpm --filter @airnauts/comments-client exec vitest run src/panel/PanelDrawer.test.tsx`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add packages/client/src/panel/PanelRow.tsx packages/client/src/panel/PanelRow.test.tsx packages/client/src/panel/PanelDrawer.tsx packages/client/src/panel/PanelDrawer.test.tsx
git commit -m "feat(client): sidebar detail view + root-comment list cards"
```

---

## Phase E — Card actions (Resolve, Copy link)

### Task 13: Resolve toggle on the list card

**Files:**
- Modify: `packages/client/src/panel/PanelRow.tsx`
- Test: `packages/client/src/panel/PanelRow.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
it('calls onResolve when the resolve button is clicked', async () => {
  const user = userEvent.setup()
  const onResolve = vi.fn()
  render(<PanelRow item={makeItem({ status: 'open' })} onSelect={() => {}} onReply={() => {}} onResolve={onResolve} />)
  await user.click(screen.getByRole('button', { name: /resolve/i }))
  expect(onResolve).toHaveBeenCalled()
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @airnauts/comments-client exec vitest run src/panel/PanelRow.test.tsx`
Expected: FAIL — no `onResolve` / resolve button.

- [ ] **Step 3: Add a resolve action to the card**

Add `onResolve: () => void` to `PanelRowProps`, and render a small button in the row's action area (next to Reply/N-Replies):

```tsx
        <button
          type="button"
          onClick={onResolve}
          aria-label={item.status === 'resolved' ? 'Reopen thread' : 'Resolve thread'}
          className="cmnt:ml-2 cmnt:bg-transparent cmnt:border-0 cmnt:p-0 cmnt:text-[11px] cmnt:font-semibold cmnt:cursor-pointer cmnt:text-green-600 cmnt:hover:underline"
        >
          {item.status === 'resolved' ? '↺ Reopen' : '✓ Resolve'}
        </button>
```

In `PanelDrawer`, pass `onResolve={() => void threads.setStatus(t.id, t.status === 'resolved' ? 'open' : 'resolved')}` to each `PanelRow` (the threads controller's `setStatus` is optimistic + persists + refreshes the panel via the registered status listener).

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter @airnauts/comments-client exec vitest run src/panel/PanelRow.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/panel/PanelRow.tsx packages/client/src/panel/PanelRow.test.tsx packages/client/src/panel/PanelDrawer.tsx
git commit -m "feat(client): resolve toggle on panel list cards"
```

---

### Task 14: Copy-link button + `?comments-thread` config

**Files:**
- Modify: `packages/client/src/config.ts`
- Modify: `packages/client/src/panel/PanelRow.tsx`
- Test: `packages/client/src/panel/PanelRow.test.tsx`, `packages/client/src/config.test.ts`

- [ ] **Step 1: Write the failing config test**

Add to `packages/client/src/config.test.ts`:

```typescript
import { DEFAULT_THREAD_PARAM, threadLink } from './config'

it('threadLink appends the thread param to a page URL', () => {
  expect(threadLink('https://site.com/a?x=1', 't42')).toBe(
    'https://site.com/a?x=1&comments-thread=t42',
  )
  expect(DEFAULT_THREAD_PARAM).toBe('comments-thread')
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @airnauts/comments-client exec vitest run src/config.test.ts`
Expected: FAIL — `DEFAULT_THREAD_PARAM`/`threadLink` not exported.

- [ ] **Step 3: Add the param + helper**

In `packages/client/src/config.ts`:

```typescript
export const DEFAULT_THREAD_PARAM = 'comments-thread'

/** Build a deep-link URL that focuses a thread on its page. */
export function threadLink(pageUrl: string, threadId: string, param = DEFAULT_THREAD_PARAM): string {
  const url = new URL(pageUrl)
  url.searchParams.set(param, threadId)
  return url.toString()
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter @airnauts/comments-client exec vitest run src/config.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing PanelRow copy-link test**

```tsx
it('copies a deep link when Copy link is clicked', async () => {
  const writeText = vi.fn().mockResolvedValue(undefined)
  Object.assign(navigator, { clipboard: { writeText } })
  const user = userEvent.setup()
  render(<PanelRow item={makeItem({ id: 't42', pageUrl: 'https://site.com/a' })} onSelect={() => {}} onReply={() => {}} onResolve={() => {}} />)
  await user.click(screen.getByRole('button', { name: /copy link/i }))
  expect(writeText).toHaveBeenCalledWith('https://site.com/a?comments-thread=t42')
})
```

- [ ] **Step 6: Run to verify it fails, then add the button**

Run the test (FAIL — no Copy link button), then add to `PanelRow` (it can call `threadLink` directly and `navigator.clipboard.writeText`; on rejection, swallow — the e2e/host wires a toast elsewhere):

```tsx
import { threadLink } from '../config'
// in the action row:
        <button
          type="button"
          aria-label="Copy link"
          onClick={() => void navigator.clipboard?.writeText(threadLink(item.pageUrl, item.id)).catch(() => {})}
          className="cmnt:ml-2 cmnt:bg-transparent cmnt:border-0 cmnt:p-0 cmnt:text-[11px] cmnt:font-medium cmnt:text-gray-500 cmnt:cursor-pointer cmnt:hover:underline"
        >
          Copy link
        </button>
```

- [ ] **Step 7: Run to verify it passes**

Run: `pnpm --filter @airnauts/comments-client exec vitest run src/panel/PanelRow.test.tsx`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add packages/client/src/config.ts packages/client/src/config.test.ts packages/client/src/panel/PanelRow.tsx packages/client/src/panel/PanelRow.test.tsx
git commit -m "feat(client): copy-link deep-link on panel list cards"
```

---

## Phase F — Navigation flow & boot restoration

### Task 15: Grow the focus handoff payload

**Files:**
- Modify: `packages/client/src/panel/navigate.ts`
- Test: `packages/client/src/panel/navigate.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `packages/client/src/panel/navigate.test.ts`:

```typescript
import { goToThread, takeFocusHandoff } from './navigate'

function memStorage(): Storage {
  const m = new Map<string, string>()
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, v),
    removeItem: (k) => void m.delete(k),
    clear: () => m.clear(),
    key: () => null,
    length: 0,
  } as Storage
}

it('round-trips an openDetail handoff', () => {
  const storage = memStorage()
  goToThread({ id: 't1', pageUrl: 'https://x/a', openDetail: true }, { storage, assign: () => {} })
  const handoff = takeFocusHandoff(storage)
  expect(handoff).toEqual({ id: 't1', openDetail: true })
  expect(takeFocusHandoff(storage)).toBeNull() // consumed once
})

it('tolerates a legacy bare-string id', () => {
  const storage = memStorage()
  storage.setItem('cmnt:focus', 't9')
  expect(takeFocusHandoff(storage)).toEqual({ id: 't9', openDetail: false })
})

it('defaults openDetail to false when omitted', () => {
  const storage = memStorage()
  goToThread({ id: 't2', pageUrl: 'https://x/b' }, { storage, assign: () => {} })
  expect(takeFocusHandoff(storage)).toEqual({ id: 't2', openDetail: false })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @airnauts/comments-client exec vitest run src/panel/navigate.test.ts`
Expected: FAIL — `takeFocusHandoff` returns a string; `goToThread` ignores `openDetail`.

- [ ] **Step 3: Rewrite `navigate.ts`**

```typescript
export const FOCUS_STORAGE_KEY = 'cmnt:focus'

export type FocusHandoff = { id: string; openDetail: boolean }

/** Read the cross-page focus target and clear it so it fires exactly once on the destination page. */
export function takeFocusHandoff(storage: Storage = sessionStorage): FocusHandoff | null {
  try {
    const raw = storage.getItem(FOCUS_STORAGE_KEY)
    if (!raw) return null
    storage.removeItem(FOCUS_STORAGE_KEY)
    if (raw.startsWith('{')) {
      const parsed = JSON.parse(raw) as Partial<FocusHandoff>
      if (typeof parsed.id === 'string') {
        return { id: parsed.id, openDetail: parsed.openDetail === true }
      }
      return null
    }
    return { id: raw, openDetail: false } // legacy bare-string id
  } catch {
    return null
  }
}

export type NavigateDeps = { storage?: Storage; assign?: (url: string) => void }

/** Stash the focus target, then navigate to the thread's page (full reload or SPA route). */
export function goToThread(
  row: { id: string; pageUrl: string; openDetail?: boolean },
  deps: NavigateDeps = {},
): void {
  const storage = deps.storage ?? sessionStorage
  try {
    storage.setItem(
      FOCUS_STORAGE_KEY,
      JSON.stringify({ id: row.id, openDetail: row.openDetail === true }),
    )
  } catch {
    /* storage unavailable — navigation still proceeds, just without auto-focus */
  }
  const assign =
    deps.assign ??
    ((url: string) => {
      window.location.href = url
    })
  assign(row.pageUrl)
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter @airnauts/comments-client exec vitest run src/panel/navigate.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/panel/navigate.ts packages/client/src/panel/navigate.test.ts
git commit -m "feat(client): carry openDetail intent in the focus handoff"
```

---

### Task 16: Boot consumer opens the detail (MarkerLayer + panel controller)

**Files:**
- Modify: `packages/client/src/marker/MarkerLayer.tsx:96-101`
- Test: `packages/client/src/marker/MarkerLayer.test.tsx` (or a focused boot test)

- [ ] **Step 1: Write the failing test**

In `packages/client/src/marker/MarkerLayer.test.tsx`, seed an `openDetail` handoff before mount and assert the panel opens to detail. Reuse the file's existing render harness (it mounts `MarkerLayer` within Threads/Panel/Drafts/Toast providers and a mock client whose `listThreads` returns one thread `t1`). Add:

```tsx
import { goToThread } from '../panel/navigate'

it('opens the panel detail for an openDetail handoff on boot', async () => {
  goToThread({ id: 't1', pageUrl: 'https://x/a', openDetail: true }, { storage: sessionStorage, assign: () => {} })
  renderMarkerLayer({ threads: [makeItem('t1')] }) // existing harness; mounts PanelDrawer too
  // after the boot refresh resolves:
  expect(await screen.findByRole('button', { name: /back/i })).toBeInTheDocument()
})
```

If the harness does not already render `PanelDrawer`, assert instead on the panel controller being called: spy on `usePanelController().openDetail` via a test double, or expose panel state through a small probe component. Prefer the visible-Back assertion if `PanelDrawer` is in the harness.

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @airnauts/comments-client exec vitest run src/marker/MarkerLayer.test.tsx`
Expected: FAIL — boot only calls `requestFocus`, never opens the panel detail.

- [ ] **Step 3: Wire the panel controller into the boot consumer**

In `packages/client/src/marker/MarkerLayer.tsx`:

Add the panel controller via the existing hook:

```tsx
import { usePanelController } from '../panel/PanelProvider'
// near the other hooks at the top of the component:
  const panel = usePanelController()
```

Update the boot handoff consumer (the `.then` after `rt.refresh()`):

```tsx
      .then(() => {
        const handoff = takeFocusHandoff()
        if (handoff) {
          controller.requestFocus(handoff.id)
          if (handoff.openDetail) {
            void panel.openPanel()
            panel.openDetail(handoff.id)
          }
        }
      })
```

Add `panel` to the effect's dependency array (alongside `client, activeKey, dispatch, controller`). `openPanel()` opens the drawer and loads the list (so the detail's header `item` resolves from `state.list`); `openDetail(handoff.id)` switches to the detail view; `requestFocus` opens the pin popover + pulses.

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter @airnauts/comments-client exec vitest run src/marker/MarkerLayer.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/marker/MarkerLayer.tsx packages/client/src/marker/MarkerLayer.test.tsx
git commit -m "feat(client): restore sidebar detail on cross-page focus handoff"
```

---

### Task 17: Mount `DraftsProvider` and thread props into `PanelDrawer`

**Files:**
- Modify: `packages/client/src/app/app.tsx`
- Test: `packages/client/src/app/app.test.tsx`

- [ ] **Step 1: Write the failing test**

Add to `packages/client/src/app/app.test.tsx` a smoke assertion that the app renders without a missing-provider throw and that opening the panel + selecting a row reaches the detail. If the file already has a panel-open test, extend it; otherwise add:

```tsx
it('mounts DraftsProvider so the detail view can render', async () => {
  // render the app with a mock client returning one same-page thread,
  // open the launcher, click the row, expect a Back button.
  // (Reuse the file's existing app render harness + mock client.)
})
```

If writing a full app-level interaction test is heavy, instead assert that `useDraft` does not throw when the panel detail mounts (the absence of a `DraftsProvider` throws "useDraft must be used within <DraftsProvider>"). A minimal render of `<WidgetApp .../>` that opens the panel detail is sufficient to catch a missing provider.

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @airnauts/comments-client exec vitest run src/app/app.test.tsx`
Expected: FAIL — `useDraft` throws (no `DraftsProvider`) and/or `PanelDrawer` is missing `client`/`identity`/`onNeedIdentity` props.

- [ ] **Step 3: Add the provider + pass props**

In `packages/client/src/app/app.tsx`:

Import and wrap so both the popover (`MarkerLayer`) and the drawer share one drafts store. Place `DraftsProvider` inside `PanelProvider` (or around both `MarkerLayer` and `PanelDrawer`):

```tsx
import { DraftsProvider } from '../drafts/DraftsProvider'
// ...
          <PanelProvider client={client}>
            <DraftsProvider>
              <MarkerLayer
                client={client}
                pageKey={pageKey}
                pageUrl={pageUrl}
                resolvePageKey={(url) => resolvePageKey(options, url)}
                identity={identity}
                onNeedIdentity={onNeedIdentity}
                provenance={options.provenance}
              />
              <PanelDrawer
                resolvePageKey={(url) => resolvePageKey(options, url)}
                client={client}
                identity={identity}
                onNeedIdentity={onNeedIdentity}
              />
            </DraftsProvider>
          </PanelProvider>
```

(`client`, `identity`, `onNeedIdentity` are already in scope here — they are passed to `MarkerLayer` today.)

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter @airnauts/comments-client exec vitest run src/app/app.test.tsx`
Expected: PASS.

- [ ] **Step 5: Read/strip `?comments-thread` at boot**

In `packages/client/src/index.ts`, mirror the key-param handling so a deep-link is honored and then cleaned. The actual "open detail" is driven by the existing focus handoff, so on boot translate the URL param into a handoff before mounting:

```typescript
import { DEFAULT_KEY_PARAM, DEFAULT_THREAD_PARAM, type InitOptions } from './config'
import { FOCUS_STORAGE_KEY } from './panel/navigate'

function consumeThreadParam(param: string): void {
  const url = new URL(window.location.href)
  const id = url.searchParams.get(param)
  if (!id) return
  try {
    sessionStorage.setItem(FOCUS_STORAGE_KEY, JSON.stringify({ id, openDetail: true }))
  } catch {
    /* storage unavailable — deep-link focus is best-effort */
  }
  url.searchParams.delete(param)
  window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash)
}
```

Call `consumeThreadParam(options.threadParam ?? DEFAULT_THREAD_PARAM)` after the activation gate passes and before `const { mount } = await import('./app/mount')`. Add an optional `threadParam?: string` to `InitOptions` in `config.ts`. On boot, `MarkerLayer`'s handoff consumer (Task 16) then opens the detail and strips nothing further (the param is already stripped here).

- [ ] **Step 6: Add an index test for the strip**

In `packages/client/src/index.test.ts`, add a case: with `?comments-thread=t5` in the URL and a passing activation, after `init(...)` the URL no longer contains `comments-thread` and `sessionStorage[FOCUS_STORAGE_KEY]` holds `{"id":"t5","openDetail":true}`. Reuse the file's existing window/location mocking.

- [ ] **Step 7: Run to verify it passes**

Run: `pnpm --filter @airnauts/comments-client exec vitest run src/index.test.ts src/app/app.test.tsx`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add packages/client/src/app/app.tsx packages/client/src/app/app.test.tsx packages/client/src/index.ts packages/client/src/index.test.ts packages/client/src/config.ts
git commit -m "feat(client): mount DraftsProvider + honor ?comments-thread deep-link"
```

---

## Phase G — Docs, full verification, release

### Task 18: Create `docs/ideas.md` with the deferred backlog

**Files:**
- Create: `docs/ideas.md`

- [ ] **Step 1: Write the file**

```markdown
# Ideas backlog

Forward-looking ideas deliberately deferred. Sibling to `issues.md` (which logs
known rough edges in shipped behavior). Each entry: what, why deferred, rough shape.

## Detail-view prev/next navigation

Up/down chevrons in the sidebar detail header that step through the current filtered
list order without returning to the list (Vercel-toolbar parity). Deferred from the
sidebar master–detail iteration to keep that change focused. Shape: track the index of
`detailThreadId` within `panel.state.list`; chevrons dispatch `OPEN_DETAIL` for the
neighbor + `requestFocus`.

## Emoji reactions on comments

React to a comment with emoji. Deferred — it is a full backend feature: a new field on
the `Comment` schema, add/remove-reaction endpoints, both adapters, and the contract
suite. Not a UI-only change.

## Per-comment more-menu (···)

Overflow menu per comment (edit / delete / copy text). Deferred — edit and delete are
new backend operations (`PATCH`/`DELETE` on a comment) with their own contract +
optimistic UI.
```

- [ ] **Step 2: Commit**

```bash
git add docs/ideas.md
git commit -m "docs: add ideas backlog (prev/next, reactions, more-menu)"
```

---

### Task 19: Full client + workspace verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full client test suite (builds CSS first)**

Run: `pnpm --filter @airnauts/comments-client test`
Expected: PASS (all unit/component tests, including the new ones).

- [ ] **Step 2: Run the full workspace test + typecheck + lint**

Run: `pnpm -r test && pnpm -r typecheck && pnpm lint`
Expected: PASS across all packages. Fix any biome findings (e.g. unused `resolved` in `PanelRow`, import ordering) and re-run.

- [ ] **Step 3: Build the client to confirm the bundle compiles**

Run: `pnpm --filter @airnauts/comments-client build`
Expected: PASS (tsup + `tsc --build --force`).

- [ ] **Step 4: Commit any lint/format fixups**

```bash
git add -A
git commit -m "chore: lint + format fixups for sidebar detail view"
```

---

### Task 20: e2e coverage (Playwright, hermetic)

**Files:**
- Create: `e2e/sidebar-detail.spec.ts` (mirror the existing M10 e2e harness; reuse its fixtures/page-objects)

- [ ] **Step 1: Inspect the existing e2e harness**

Read the existing specs under `e2e/` (the M10 verification harness — see `docs/superpowers/specs/2026-06-02-m10-verification-release-design.md`). Note how it boots a hermetic server + the Next host, activates the widget, creates a thread, and queries pins/panel by `data-testid`.

- [ ] **Step 2: Write the three scenarios**

Following that harness's helpers, add `e2e/sidebar-detail.spec.ts`:

1. **Same-page open-detail:** create a thread on the current page → open the launcher → click the row → assert the detail view shows (Back button visible), the panel stays open, and the pin pulses (`data-testid` from `MarkerLayer`/`Pin`).
2. **Cross-page open-detail restoration:** create a thread on page B → from page A's panel click that row → assert navigation to page B → assert the drawer reopens to that thread's detail (Back visible) with the pin focused.
3. **Copy-link deep-link:** load page B with `?comments-thread=<id>` → assert the drawer opens to that thread's detail and the URL no longer contains `comments-thread`.

Match the existing specs' assertions style (locators by `data-testid`, `expect(...).toBeVisible()`).

- [ ] **Step 3: Run the e2e suite**

Run the project's e2e command (the same one CI's `e2e` job runs — check `package.json`/`.github/workflows/ci.yml`, typically `pnpm e2e` or `pnpm --filter <e2e-pkg> test`).
Expected: PASS for the three new scenarios (and no regressions).

- [ ] **Step 4: Commit**

```bash
git add e2e/sidebar-detail.spec.ts
git commit -m "test(e2e): sidebar detail open, cross-page restore, deep-link"
```

---

### Task 21: Client changeset

**Files:**
- Create: `.changeset/sidebar-detail-view.md`

- [ ] **Step 1: Write the changeset**

```markdown
---
"@airnauts/comments-client": minor
---

The comments sidebar is now a master–detail surface: list cards show each thread's
first message with a Reply action, clicking a thread opens an in-sidebar detail view
(with a Back button) while focusing its pin, the pin popover and sidebar share a live
composer draft, and each card has a Copy-link deep-link to the thread.
```

- [ ] **Step 2: Commit**

```bash
git add .changeset/sidebar-detail-view.md
git commit -m "chore: changeset for sidebar master-detail client feature"
```

---

## Self-review notes (for the executor)

- **Reply vs N-Replies (spec §1):** both open the same detail view (the detail composer is the reply surface); `onReply` and `onSelect` both route through `openDetail`. There is no separate "compose without opening" path.
- **`item` source in the detail header (Task 12):** prefer the panel list item by `detailThreadId`; fall back to the loaded `detail` (cross-page boot, where the list may still be loading). This avoids a blank header while `getThread` is in flight.
- **Draft clear ownership (spec §5):** clearing happens inside `Composer.doSend` via the controlled `onValueChange('')` / `onAttachmentChange(null)`, which write the shared `drafts` slice — never local state — so the two surfaces never fight.
- **Mongo `$slice` (Task 4):** `{ comments: { $slice: 1 } }` coexists with field exclusions; verified by the contract suite running against the real adapter.
