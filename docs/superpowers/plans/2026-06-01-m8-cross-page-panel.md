# M8 — Cross-page comments panel — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the cross-page comments panel — a flat, activity-ordered list of threads across all pages with a pinned "Needs review" (orphan) section, opened from the Launcher as a right-edge drawer, where clicking a thread navigates to its page and focuses its pin.

**Architecture:** The panel is a **second, independent data surface** beside the M6 anchoring runtime. It lives in a new `panel/` slice (reducer + imperative controller + provider), fetches the all-pages list via the existing `client.listThreads` (no `pageKey`), and reuses the threads store for the one genuinely new mechanism — `focusThread`, which waits for a pin to land in `placementsById` after async re-match, then scrolls + pulses. Cross-page focus is handed off via `sessionStorage['cmnt:focus']` and consumed on the destination page's boot.

**Tech Stack:** TypeScript, React 19, `@radix-ui/react-dialog` (already a dep) for the drawer, Tailwind v4 with the `cmnt:` prefix, Vitest + Testing Library (jsdom). Spec: [`docs/superpowers/specs/2026-06-01-m8-cross-page-panel-design.md`](../specs/2026-06-01-m8-cross-page-panel-design.md).

---

## Conventions for every task

- Run tests from the client package: `cd packages/client && pnpm exec vitest run <path>`.
- Follow existing idioms: `cmnt:` Tailwind prefix, `cn()` from `../lib/cn`, controllers created once via `useMemo`, providers keep a live `stateRef` so the controller reads fresh state (see `threads/ThreadsProvider.tsx`).
- Commit after each task with the shown message.

## File structure (what each new/changed file owns)

**New — panel slice**
- `packages/client/src/panel/state.ts` — `PanelState`, `PanelFilter`, `Action`, `reducer`, `mainListExcludingReview` selector. Pure.
- `packages/client/src/panel/controller.ts` — `PanelController` + `createPanelController` (fetch orchestration over `listThreads`).
- `packages/client/src/panel/PanelProvider.tsx` — context, reducer wiring, controller, `usePanelState`/`usePanelController` hooks.
- `packages/client/src/panel/navigate.ts` — `FOCUS_STORAGE_KEY`, `takeFocusHandoff`, `goToThread` (sessionStorage + navigation, injectable).
- `packages/client/src/panel/PanelRow.tsx` — one thread row.
- `packages/client/src/panel/PanelDrawer.tsx` — the drawer: header, filter, Needs-review section, list, Load more, row-click routing, while-open refetch.

**New — focus mechanism**
- `packages/client/src/marker/useFocusPin.ts` — effect that waits for placement then scrolls + pulses, or times out to the lost-anchor toast.

**Changed**
- `packages/client/src/threads/state.ts` — add `focusedId`/`pendingFocusId` + `REQUEST_FOCUS`/`FOCUS_PLACED`/`CLEAR_FOCUS`/`CLEAR_PENDING_FOCUS`.
- `packages/client/src/threads/controller.ts` — add `requestFocus`, `registerStatusListener`; fire the listener on `setStatus` success.
- `packages/client/src/threads/useThreads.ts` — add `useFocus()`.
- `packages/client/src/ui/Pin.tsx` — add `focused?: boolean` (pulse ring + `data-focused`).
- `packages/client/src/ui/ThreadPopover.tsx` — forward `focused` to `Pin`.
- `packages/client/src/positioning/layer.tsx` — read `useFocus()`, pass `focused` per pin.
- `packages/client/src/ui/Launcher.tsx` — add `onTogglePanel` + list button.
- `packages/client/src/marker/MarkerLayer.tsx` — wire Launcher panel button, the focus effect, and boot handoff.
- `packages/client/src/app/app.tsx` — wrap subtree in `PanelProvider`, render `PanelDrawer`.

---

## Task 1: Panel reducer + selector (pure)

**Files:**
- Create: `packages/client/src/panel/state.ts`
- Test: `packages/client/src/panel/state.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/client/src/panel/state.test.ts
import type { ThreadListItem } from '@comments/core'
import { describe, expect, it } from 'vitest'
import { initialState, mainListExcludingReview, reducer } from './state'

const item = (id: string, over: Partial<ThreadListItem> = {}): ThreadListItem =>
  ({ id, status: 'open', anchorState: 'anchored', unresolvedCount: 1 } as ThreadListItem & typeof over)

describe('panel reducer', () => {
  it('defaults to a closed drawer filtered to open', () => {
    expect(initialState.open).toBe(false)
    expect(initialState.filter).toBe('open')
  })

  it('OPEN/CLOSE toggle visibility without touching the list', () => {
    const open = reducer({ ...initialState, list: [item('a')] }, { type: 'OPEN' })
    expect(open.open).toBe(true)
    expect(open.list).toHaveLength(1)
    expect(reducer(open, { type: 'CLOSE' }).open).toBe(false)
  })

  it('SET_FILTER changes filter and resets the page', () => {
    const next = reducer(
      { ...initialState, list: [item('a')], nextCursor: 'c1' },
      { type: 'SET_FILTER', filter: 'resolved' },
    )
    expect(next.filter).toBe('resolved')
    expect(next.list).toEqual([])
    expect(next.nextCursor).toBeNull()
  })

  it('LOAD_SUCCESS replaces list + cursor + needsReview and clears loading/error', () => {
    const next = reducer(
      { ...initialState, loading: true, error: true },
      { type: 'LOAD_SUCCESS', list: [item('a')], nextCursor: 'c2', needsReview: [item('b')] },
    )
    expect(next.list.map((t) => t.id)).toEqual(['a'])
    expect(next.nextCursor).toBe('c2')
    expect(next.needsReview.map((t) => t.id)).toEqual(['b'])
    expect(next.loading).toBe(false)
    expect(next.error).toBe(false)
  })

  it('LOAD_MORE_SUCCESS appends to the existing list', () => {
    const next = reducer(
      { ...initialState, list: [item('a')], loadingMore: true },
      { type: 'LOAD_MORE_SUCCESS', list: [item('b')], nextCursor: null },
    )
    expect(next.list.map((t) => t.id)).toEqual(['a', 'b'])
    expect(next.nextCursor).toBeNull()
    expect(next.loadingMore).toBe(false)
  })

  it('mainListExcludingReview drops ids already in needsReview', () => {
    const state = {
      ...initialState,
      list: [item('a'), item('b')],
      needsReview: [item('b')],
    }
    expect(mainListExcludingReview(state).map((t) => t.id)).toEqual(['a'])
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd packages/client && pnpm exec vitest run src/panel/state.test.ts`
Expected: FAIL — cannot find module `./state`.

- [ ] **Step 3: Write the implementation**

```ts
// packages/client/src/panel/state.ts
import type { ThreadListItem } from '@comments/core'

export type PanelFilter = 'open' | 'resolved' | 'all'

export type PanelState = {
  open: boolean
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
  filter: 'open',
  list: [],
  nextCursor: null,
  loading: false,
  loadingMore: false,
  error: false,
  needsReview: [],
}

export type Action =
  | { type: 'OPEN' }
  | { type: 'CLOSE' }
  | { type: 'SET_FILTER'; filter: PanelFilter }
  | { type: 'LOAD_START' }
  | { type: 'LOAD_SUCCESS'; list: ThreadListItem[]; nextCursor: string | null; needsReview: ThreadListItem[] }
  | { type: 'LOAD_ERROR' }
  | { type: 'LOAD_MORE_START' }
  | { type: 'LOAD_MORE_SUCCESS'; list: ThreadListItem[]; nextCursor: string | null }
  | { type: 'LOAD_MORE_ERROR' }

export function reducer(state: PanelState, action: Action): PanelState {
  switch (action.type) {
    case 'OPEN':
      return { ...state, open: true }
    case 'CLOSE':
      return { ...state, open: false }
    case 'SET_FILTER':
      return { ...state, filter: action.filter, list: [], nextCursor: null }
    case 'LOAD_START':
      return { ...state, loading: true, error: false }
    case 'LOAD_SUCCESS':
      return {
        ...state,
        loading: false,
        error: false,
        list: action.list,
        nextCursor: action.nextCursor,
        needsReview: action.needsReview,
      }
    case 'LOAD_ERROR':
      return { ...state, loading: false, error: true }
    case 'LOAD_MORE_START':
      return { ...state, loadingMore: true }
    case 'LOAD_MORE_SUCCESS':
      return {
        ...state,
        loadingMore: false,
        list: [...state.list, ...action.list],
        nextCursor: action.nextCursor,
      }
    case 'LOAD_MORE_ERROR':
      return { ...state, loadingMore: false }
    default:
      return state
  }
}

/** Main list with Needs-review ids removed, so an open orphan isn't shown twice. */
export function mainListExcludingReview(state: PanelState): ThreadListItem[] {
  if (state.needsReview.length === 0) return state.list
  const review = new Set(state.needsReview.map((t) => t.id))
  return state.list.filter((t) => !review.has(t.id))
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `cd packages/client && pnpm exec vitest run src/panel/state.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/panel/state.ts packages/client/src/panel/state.test.ts
git commit -m "M8: panel reducer + mainListExcludingReview selector"
```

---

## Task 2: Panel controller (fetch orchestration)

**Files:**
- Create: `packages/client/src/panel/controller.ts`
- Test: `packages/client/src/panel/controller.test.ts`

The controller dispatches into the Task 1 reducer and calls `listThreads`. `load()` takes an explicit `filter` so callers don't depend on the async-lagging state ref after `SET_FILTER`.

- [ ] **Step 1: Write the failing test**

```ts
// packages/client/src/panel/controller.test.ts
import type { ThreadListItem, ThreadListResponse } from '@comments/core'
import { describe, expect, it, vi } from 'vitest'
import { createPanelController } from './controller'
import { initialState, reducer, type PanelState } from './state'

const item = (id: string, over: Partial<ThreadListItem> = {}): ThreadListItem =>
  ({ id, status: 'open', anchorState: 'anchored', unresolvedCount: 1, ...over } as ThreadListItem)

function harness(listThreads: (p?: unknown) => Promise<ThreadListResponse>) {
  let state: PanelState = initialState
  const dispatch = (a: Parameters<typeof reducer>[1]) => {
    state = reducer(state, a)
  }
  const controller = createPanelController(dispatch, {
    client: { listThreads: listThreads as never },
    getState: () => state,
  })
  return { controller, get: () => state }
}

describe('panel controller', () => {
  it('openPanel fetches the main list (status=open) and the open-orphan review list', async () => {
    const listThreads = vi.fn(async (p: { status?: string; cursor?: string }) => {
      if (p.status === 'open' && !p.cursor)
        return { threads: [item('a'), item('orph', { anchorState: 'orphaned' })], nextCursor: 'c1' }
      return { threads: [], nextCursor: null }
    })
    const h = harness(listThreads as never)
    await h.controller.openPanel()
    expect(h.get().open).toBe(true)
    // main fetch carries sort + status; review fetch is status=open, no sort/cursor
    expect(listThreads).toHaveBeenCalledWith({ sort: 'updatedAt', status: 'open' })
    expect(listThreads).toHaveBeenCalledWith({ status: 'open' })
    expect(h.get().needsReview.map((t) => t.id)).toEqual(['orph'])
    expect(h.get().nextCursor).toBe('c1')
  })

  it('all filter omits status on the main fetch', async () => {
    const listThreads = vi.fn(async () => ({ threads: [], nextCursor: null }))
    const h = harness(listThreads as never)
    await h.controller.setFilter('all')
    expect(h.get().filter).toBe('all')
    expect(listThreads).toHaveBeenCalledWith({ sort: 'updatedAt' })
  })

  it('loadMore appends using the current cursor and is a no-op when cursor is null', async () => {
    const listThreads = vi.fn(async (p: { cursor?: string; status?: string }) => {
      if (p.status === 'open' && !p.cursor) return { threads: [item('a')], nextCursor: 'c1' }
      if (p.cursor === 'c1') return { threads: [item('b')], nextCursor: null }
      return { threads: [], nextCursor: null }
    })
    const h = harness(listThreads as never)
    await h.controller.openPanel()
    await h.controller.loadMore()
    expect(h.get().list.map((t) => t.id)).toEqual(['a', 'b'])
    listThreads.mockClear()
    await h.controller.loadMore() // cursor null now → no fetch
    expect(listThreads).not.toHaveBeenCalled()
  })

  it('sets error when the fetch rejects', async () => {
    const h = harness(vi.fn(async () => { throw new Error('net') }) as never)
    await h.controller.openPanel()
    expect(h.get().error).toBe(true)
    expect(h.get().loading).toBe(false)
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd packages/client && pnpm exec vitest run src/panel/controller.test.ts`
Expected: FAIL — cannot find module `./controller`.

- [ ] **Step 3: Write the implementation**

```ts
// packages/client/src/panel/controller.ts
import type { ApiClient } from '../api/client'
import type { Action, PanelFilter, PanelState } from './state'

export type PanelController = {
  openPanel(): Promise<void>
  closePanel(): void
  setFilter(filter: PanelFilter): Promise<void>
  loadMore(): Promise<void>
  refresh(): Promise<void>
}

export function createPanelController(
  dispatch: (a: Action) => void,
  deps: { client: Pick<ApiClient, 'listThreads'>; getState: () => PanelState },
): PanelController {
  const statusParam = (filter: PanelFilter) => (filter === 'all' ? {} : { status: filter })

  async function load(filter: PanelFilter): Promise<void> {
    dispatch({ type: 'LOAD_START' })
    try {
      const [main, review] = await Promise.all([
        deps.client.listThreads({ sort: 'updatedAt', ...statusParam(filter) }),
        deps.client.listThreads({ status: 'open' }),
      ])
      dispatch({
        type: 'LOAD_SUCCESS',
        list: main.threads,
        nextCursor: main.nextCursor,
        needsReview: review.threads.filter((t) => t.anchorState === 'orphaned'),
      })
    } catch {
      dispatch({ type: 'LOAD_ERROR' })
    }
  }

  return {
    async openPanel() {
      dispatch({ type: 'OPEN' })
      await load(deps.getState().filter)
    },
    closePanel() {
      dispatch({ type: 'CLOSE' })
    },
    async setFilter(filter) {
      dispatch({ type: 'SET_FILTER', filter })
      await load(filter)
    },
    async refresh() {
      await load(deps.getState().filter)
    },
    async loadMore() {
      const { nextCursor, filter } = deps.getState()
      if (!nextCursor) return
      dispatch({ type: 'LOAD_MORE_START' })
      try {
        const res = await deps.client.listThreads({
          sort: 'updatedAt',
          cursor: nextCursor,
          ...statusParam(filter),
        })
        dispatch({ type: 'LOAD_MORE_SUCCESS', list: res.threads, nextCursor: res.nextCursor })
      } catch {
        dispatch({ type: 'LOAD_MORE_ERROR' })
      }
    },
  }
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `cd packages/client && pnpm exec vitest run src/panel/controller.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/panel/controller.ts packages/client/src/panel/controller.test.ts
git commit -m "M8: panel controller — list + open-orphan fetch, filter, load-more"
```

---

## Task 3: Panel provider + hooks

**Files:**
- Create: `packages/client/src/panel/PanelProvider.tsx`
- Test: `packages/client/src/panel/PanelProvider.test.tsx`

Mirrors `ThreadsProvider`: a live `stateRef` so the controller reads fresh state.

- [ ] **Step 1: Write the failing test**

```tsx
// packages/client/src/panel/PanelProvider.test.tsx
import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { PanelProvider } from './PanelProvider'
import { usePanelController, usePanelState } from './PanelProvider'

function Probe() {
  const state = usePanelState()
  const controller = usePanelController()
  return (
    <div>
      <button type="button" onClick={() => void controller.openPanel()}>open</button>
      <span data-testid="open">{state.open ? 'yes' : 'no'}</span>
      <span data-testid="count">{state.list.length}</span>
    </div>
  )
}

describe('PanelProvider', () => {
  it('openPanel flips open and loads the list', async () => {
    const listThreads = vi.fn(async () => ({ threads: [{ id: 'a' }], nextCursor: null }))
    render(
      <PanelProvider client={{ listThreads } as never}>
        <Probe />
      </PanelProvider>,
    )
    screen.getByText('open').click()
    await waitFor(() => expect(screen.getByTestId('open').textContent).toBe('yes'))
    await waitFor(() => expect(screen.getByTestId('count').textContent).toBe('1'))
  })

  it('throws when hooks are used outside the provider', () => {
    function Bare() {
      usePanelState()
      return null
    }
    expect(() => render(<Bare />)).toThrow(/PanelProvider/)
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd packages/client && pnpm exec vitest run src/panel/PanelProvider.test.tsx`
Expected: FAIL — cannot find module `./PanelProvider`.

- [ ] **Step 3: Write the implementation**

```tsx
// packages/client/src/panel/PanelProvider.tsx
import { createContext, type ReactNode, useContext, useMemo, useReducer, useRef } from 'react'
import type { ApiClient } from '../api/client'
import { createPanelController, type PanelController } from './controller'
import { initialState, type PanelState, reducer } from './state'

type PanelContextValue = { state: PanelState; controller: PanelController }

const PanelContext = createContext<PanelContextValue | null>(null)

export function PanelProvider({
  client,
  children,
}: {
  client: Pick<ApiClient, 'listThreads'>
  children: ReactNode
}) {
  const [state, dispatch] = useReducer(reducer, initialState)
  const stateRef = useRef(state)
  stateRef.current = state

  const controller = useMemo(
    () => createPanelController(dispatch, { client, getState: () => stateRef.current }),
    [client],
  )

  const value = useMemo<PanelContextValue>(() => ({ state, controller }), [state, controller])
  return <PanelContext.Provider value={value}>{children}</PanelContext.Provider>
}

function useCtx() {
  const ctx = useContext(PanelContext)
  if (!ctx) throw new Error('usePanel hooks must be used within <PanelProvider>')
  return ctx
}

export function usePanelState() {
  return useCtx().state
}

export function usePanelController() {
  return useCtx().controller
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `cd packages/client && pnpm exec vitest run src/panel/PanelProvider.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/panel/PanelProvider.tsx packages/client/src/panel/PanelProvider.test.tsx
git commit -m "M8: PanelProvider + usePanelState/usePanelController hooks"
```

---

## Task 4: Focus state in the threads reducer

**Files:**
- Modify: `packages/client/src/threads/state.ts`
- Test: `packages/client/src/threads/state.test.ts` (append cases)

- [ ] **Step 1: Write the failing test (append to the existing describe block)**

```ts
// append inside packages/client/src/threads/state.test.ts
// (the file already imports `initialState` and `reducer` from './state' — do not re-import)

describe('focus actions', () => {
  it('REQUEST_FOCUS opens the thread, arms pending focus, clears draft + prior focusedId', () => {
    const next = reducer(
      { ...initialState, focusedId: 'old', draft: { anchor: {}, point: { x: 0, y: 0 }, pin: { x: 0, y: 0 } } as never },
      { type: 'REQUEST_FOCUS', id: 't1' },
    )
    expect(next.openId).toBe('t1')
    expect(next.pendingFocusId).toBe('t1')
    expect(next.focusedId).toBeNull()
    expect(next.draft).toBeNull()
  })

  it('FOCUS_PLACED sets focusedId and clears pendingFocusId', () => {
    const next = reducer(
      { ...initialState, pendingFocusId: 't1' },
      { type: 'FOCUS_PLACED', id: 't1' },
    )
    expect(next.focusedId).toBe('t1')
    expect(next.pendingFocusId).toBeNull()
  })

  it('CLEAR_FOCUS clears the pulse; CLEAR_PENDING_FOCUS disarms the wait', () => {
    expect(reducer({ ...initialState, focusedId: 't1' }, { type: 'CLEAR_FOCUS' }).focusedId).toBeNull()
    expect(
      reducer({ ...initialState, pendingFocusId: 't1' }, { type: 'CLEAR_PENDING_FOCUS' }).pendingFocusId,
    ).toBeNull()
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd packages/client && pnpm exec vitest run src/threads/state.test.ts`
Expected: FAIL — `pendingFocusId`/action types do not exist.

- [ ] **Step 3: Edit `state.ts`**

In `ThreadsState`, add two fields after `lostOpenId`:

```ts
  /** A thread the panel asked us to focus; the focus effect waits for its placement. */
  pendingFocusId: string | null
  /** A just-focused thread; its pin pulses briefly. */
  focusedId: string | null
```

In `initialState`, add:

```ts
  pendingFocusId: null,
  focusedId: null,
```

In the `Action` union, add:

```ts
  | { type: 'REQUEST_FOCUS'; id: string }
  | { type: 'FOCUS_PLACED'; id: string }
  | { type: 'CLEAR_FOCUS' }
  | { type: 'CLEAR_PENDING_FOCUS' }
```

In `reducer`, add these cases before `default:`:

```ts
    case 'REQUEST_FOCUS':
      return { ...state, openId: action.id, draft: null, pendingFocusId: action.id, focusedId: null }
    case 'FOCUS_PLACED':
      return { ...state, focusedId: action.id, pendingFocusId: null }
    case 'CLEAR_FOCUS':
      return { ...state, focusedId: null }
    case 'CLEAR_PENDING_FOCUS':
      return { ...state, pendingFocusId: null }
```

- [ ] **Step 4: Run it to verify it passes**

Run: `cd packages/client && pnpm exec vitest run src/threads/state.test.ts`
Expected: PASS (existing + 3 new).

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/threads/state.ts packages/client/src/threads/state.test.ts
git commit -m "M8: focus state (pendingFocusId/focusedId) in the threads reducer"
```

---

## Task 5: Controller `requestFocus` + status listener

**Files:**
- Modify: `packages/client/src/threads/controller.ts`
- Test: `packages/client/src/threads/controller.test.ts`

> If `controller.test.ts` does not yet exist, create it with the imports shown. The controller takes `(dispatch, deps)` where deps has `client`, `isCached`, `isLoading`.

- [ ] **Step 1: Write the failing test**

```ts
// packages/client/src/threads/controller.test.ts
import { describe, expect, it, vi } from 'vitest'
import { createController } from './controller'
import type { Action } from './state'

function make(over: { isCached?: boolean } = {}) {
  const actions: Action[] = []
  const dispatch = (a: Action) => actions.push(a)
  const getThread = vi.fn().mockResolvedValue({ id: 't1', status: 'open', comments: [] })
  const setThreadStatus = vi.fn().mockResolvedValue({ id: 't1', status: 'resolved' })
  const controller = createController(dispatch, {
    client: { getThread, setThreadStatus } as never,
    isCached: () => over.isCached ?? false,
    isLoading: () => false,
  })
  return { actions, controller, getThread, setThreadStatus }
}

describe('controller.requestFocus', () => {
  it('dispatches REQUEST_FOCUS and lazily fetches detail when uncached', async () => {
    const { actions, controller, getThread } = make({ isCached: false })
    controller.requestFocus('t1')
    expect(actions[0]).toEqual({ type: 'REQUEST_FOCUS', id: 't1' })
    expect(getThread).toHaveBeenCalledWith('t1')
  })

  it('does not refetch when detail is cached', () => {
    const { controller, getThread } = make({ isCached: true })
    controller.requestFocus('t1')
    expect(getThread).not.toHaveBeenCalled()
  })
})

describe('controller status listener', () => {
  it('notifies the registered listener after setStatus persists', async () => {
    const { controller, setThreadStatus } = make()
    const listener = vi.fn()
    controller.registerStatusListener(listener)
    await controller.setStatus('t1', 'resolved')
    expect(setThreadStatus).toHaveBeenCalledWith('t1', { status: 'resolved' })
    expect(listener).toHaveBeenCalledWith('t1', 'resolved')
  })

  it('does not notify when setStatus fails', async () => {
    const actions: Action[] = []
    const setThreadStatus = vi.fn().mockRejectedValue(new Error('net'))
    const controller = createController((a) => actions.push(a), {
      client: { getThread: vi.fn(), setThreadStatus } as never,
      isCached: () => true,
      isLoading: () => false,
    })
    const listener = vi.fn()
    controller.registerStatusListener(listener)
    await controller.setStatus('t1', 'resolved')
    expect(listener).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd packages/client && pnpm exec vitest run src/threads/controller.test.ts`
Expected: FAIL — `requestFocus`/`registerStatusListener` do not exist.

- [ ] **Step 3: Edit `controller.ts`**

Add to the `Controller` type:

```ts
  /** Focus a pin: open + lazy-fetch like openThread, but also arm the focus effect (scroll + pulse). */
  requestFocus(id: string): void
  /** The panel registers here to refetch its list when a status change persists (drawer-open reconciliation). */
  registerStatusListener(fn: ((id: string, status: ThreadStatus) => void) | null): void
```

Inside `createController`, add a listener slot and a shared lazy-fetch helper, then wire both `openThread` and `requestFocus` to it:

```ts
  let patchRuntime: ((id: string, status: ThreadStatus) => void) | null = null
  let statusListener: ((id: string, status: ThreadStatus) => void) | null = null

  const lazyFetchDetail = (id: string) => {
    if (deps.isCached(id) || deps.isLoading(id)) return
    dispatch({ type: 'DETAIL_LOADING', id })
    deps.client
      .getThread(id)
      .then((thread) => dispatch({ type: 'DETAIL_LOADED', id, thread }))
      .catch(() => dispatch({ type: 'DETAIL_ERROR', id }))
  }
```

Replace the body of `openThread` to reuse the helper:

```ts
    openThread(id) {
      dispatch({ type: 'OPEN', id })
      lazyFetchDetail(id)
    },
```

Add `requestFocus` and `registerStatusListener` to the returned object:

```ts
    requestFocus(id) {
      dispatch({ type: 'REQUEST_FOCUS', id })
      lazyFetchDetail(id)
    },
    registerStatusListener(fn) {
      statusListener = fn
    },
```

In `setStatus`, after `await deps.client.setThreadStatus(...)` succeeds and before `return true`, notify the listener:

```ts
      try {
        await deps.client.setThreadStatus(id, { status })
        statusListener?.(id, status)
        return true
      } catch {
```

- [ ] **Step 4: Run it to verify it passes**

Run: `cd packages/client && pnpm exec vitest run src/threads/controller.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/threads/controller.ts packages/client/src/threads/controller.test.ts
git commit -m "M8: controller.requestFocus + status listener for panel reconciliation"
```

---

## Task 6: `useFocus` hook + Pin pulse + PinLayer wiring

**Files:**
- Modify: `packages/client/src/threads/useThreads.ts`
- Modify: `packages/client/src/ui/Pin.tsx`
- Modify: `packages/client/src/ui/ThreadPopover.tsx`
- Modify: `packages/client/src/positioning/layer.tsx`
- Test: `packages/client/src/ui/Pin.test.tsx` (append a case)

- [ ] **Step 1: Write the failing test (append to `Pin.test.tsx`)**

```tsx
// append in packages/client/src/ui/Pin.test.tsx
// (the file already imports render, screen, it, expect and Pin — do not re-import)

const baseItem = {
  id: 't1',
  status: 'open',
  unresolvedCount: 2,
  createdBy: { email: 'a@b.c', name: 'Ann' },
} as never

it('marks the pin as focused via data-focused', () => {
  const { rerender } = render(<Pin item={baseItem} pin={{ x: 0, y: 0 }} focused />)
  expect(screen.getByTestId('comments-pin')).toHaveAttribute('data-focused', 'true')
  rerender(<Pin item={baseItem} pin={{ x: 0, y: 0 }} />)
  expect(screen.getByTestId('comments-pin')).not.toHaveAttribute('data-focused')
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd packages/client && pnpm exec vitest run src/ui/Pin.test.tsx`
Expected: FAIL — `focused` prop / `data-focused` not present.

- [ ] **Step 3a: Add `useFocus` to `useThreads.ts`**

```ts
export function useFocus(): { pendingFocusId: string | null; focusedId: string | null } {
  const { state } = useCtx()
  return { pendingFocusId: state.pendingFocusId, focusedId: state.focusedId }
}
```

- [ ] **Step 3b: Edit `Pin.tsx`** — add `focused` to `PinProps` and render a pulse ring + `data-focused`.

Change the props type:

```ts
export type PinProps = {
  item: ThreadListItem
  pin: XY
  onOpen?: () => void
  focused?: boolean
} & ComponentPropsWithoutRef<'button'>
```

Destructure `focused` in the function signature (add it to the existing list):

```ts
  { item, pin, onOpen, onClick, className, style, focused, ...rest },
```

Add `data-focused` on the `<button>` (next to `data-testid`):

```ts
      data-focused={focused ? 'true' : undefined}
```

Add a pulse ring as the first child inside the button (before the teardrop span), shown only when focused:

```tsx
      {focused && (
        <span
          aria-hidden={true}
          data-testid="comments-pin-pulse"
          className="cmnt:absolute cmnt:inset-0 cmnt:rounded-full cmnt:bg-blue-500/40 cmnt:animate-ping"
        />
      )}
```

- [ ] **Step 3c: Edit `ThreadPopover.tsx`** — accept and forward `focused`.

Add `focused?: boolean` to `ThreadPopoverProps`, destructure it, and pass it to `Pin`:

```tsx
export type ThreadPopoverProps = {
  item: ThreadListItem
  pin: XY
  client: Pick<ApiClient, 'getThread' | 'addComment' | 'setThreadStatus' | 'upload'>
  identity: Identity | null
  onNeedIdentity: (resume: (who: Identity) => void) => void
  focused?: boolean
}
```

```tsx
        <Pin ref={pinRef} item={item} pin={pin} focused={focused} onOpen={() => {}} />
```

- [ ] **Step 3d: Edit `positioning/layer.tsx`** — read focus and pass per pin.

Add the import and read the focused id:

```tsx
import { useFocus } from '../threads/useThreads'
```

Inside `PinLayer`, before the return:

```tsx
  const { focusedId } = useFocus()
```

Pass `focused` to each `ThreadPopover`:

```tsx
        <ThreadPopover
          key={p.item.id}
          item={p.item}
          pin={p.pin}
          client={client}
          identity={identity}
          onNeedIdentity={onNeedIdentity}
          focused={p.item.id === focusedId}
        />
```

- [ ] **Step 4: Run it to verify it passes**

Run: `cd packages/client && pnpm exec vitest run src/ui/Pin.test.tsx src/positioning/layer.test.tsx`
Expected: PASS (Pin focused case + existing layer tests unaffected).

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/threads/useThreads.ts packages/client/src/ui/Pin.tsx packages/client/src/ui/ThreadPopover.tsx packages/client/src/positioning/layer.tsx packages/client/src/ui/Pin.test.tsx
git commit -m "M8: useFocus + Pin pulse + PinLayer focus wiring"
```

---

## Task 7: `useFocusPin` — wait-for-placement, scroll + pulse, timeout toast

**Files:**
- Create: `packages/client/src/marker/useFocusPin.ts`
- Test: `packages/client/src/marker/useFocusPin.test.tsx`

The effect is driven by two derived inputs from the threads store: `pendingFocusId` and whether that id is currently `placed`. When placed → scroll the element + dispatch `FOCUS_PLACED` + schedule `CLEAR_FOCUS`. When not placed within `timeoutMs` → toast + `CLEAR_PENDING_FOCUS`.

- [ ] **Step 1: Write the failing test**

```tsx
// packages/client/src/marker/useFocusPin.test.tsx
import { render } from '@testing-library/react'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useFocusPin } from './useFocusPin'

function Harness(props: Omit<Parameters<typeof useFocusPin>[0], 'getElement'> & { el: Element | null }) {
  const { el, ...rest } = props
  useFocusPin({ ...rest, getElement: () => el })
  return null
}

describe('useFocusPin', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('scrolls the element and marks placed when the pin is already placed', () => {
    const scrollIntoView = vi.fn()
    const el = { scrollIntoView } as unknown as Element
    const dispatch = vi.fn()
    render(<Harness pendingFocusId="t1" placed dispatch={dispatch} toast={vi.fn()} el={el} />)
    expect(scrollIntoView).toHaveBeenCalled()
    expect(dispatch).toHaveBeenCalledWith({ type: 'FOCUS_PLACED', id: 't1' })
  })

  it('clears the pulse after the pulse window', () => {
    const dispatch = vi.fn()
    const el = { scrollIntoView: vi.fn() } as unknown as Element
    render(<Harness pendingFocusId="t1" placed dispatch={dispatch} toast={vi.fn()} el={el} />)
    act(() => vi.advanceTimersByTime(1600))
    expect(dispatch).toHaveBeenCalledWith({ type: 'CLEAR_FOCUS' })
  })

  it('toasts the lost-anchor message and disarms when placement never arrives', () => {
    const dispatch = vi.fn()
    const toast = vi.fn()
    render(
      <Harness pendingFocusId="t1" placed={false} dispatch={dispatch} toast={toast} el={null} timeoutMs={2000} />,
    )
    act(() => vi.advanceTimersByTime(2000))
    expect(toast).toHaveBeenCalledWith('This comment’s anchor was lost')
    expect(dispatch).toHaveBeenCalledWith({ type: 'CLEAR_PENDING_FOCUS' })
  })

  it('does nothing when there is no pending focus', () => {
    const dispatch = vi.fn()
    render(<Harness pendingFocusId={null} placed={false} dispatch={dispatch} toast={vi.fn()} el={null} />)
    act(() => vi.advanceTimersByTime(5000))
    expect(dispatch).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd packages/client && pnpm exec vitest run src/marker/useFocusPin.test.tsx`
Expected: FAIL — cannot find module `./useFocusPin`.

- [ ] **Step 3: Write the implementation**

```ts
// packages/client/src/marker/useFocusPin.ts
import { useEffect } from 'react'
import type { Action } from '../threads/state'

export type UseFocusPinArgs = {
  pendingFocusId: string | null
  /** Whether the pending target currently has placement geometry in the store. */
  placed: boolean
  getElement: (id: string) => Element | null
  dispatch: (a: Action) => void
  toast: (message: string) => void
  /** How long to wait for a placement before declaring the anchor lost. */
  timeoutMs?: number
}

const PULSE_MS = 1500

export function useFocusPin({
  pendingFocusId,
  placed,
  getElement,
  dispatch,
  toast,
  timeoutMs = 2000,
}: UseFocusPinArgs) {
  useEffect(() => {
    if (!pendingFocusId) return
    if (placed) {
      const el = getElement(pendingFocusId)
      try {
        el?.scrollIntoView({ block: 'center', behavior: 'smooth' })
      } catch {
        /* jsdom / unsupported — focus still proceeds */
      }
      dispatch({ type: 'FOCUS_PLACED', id: pendingFocusId })
      const clear = window.setTimeout(() => dispatch({ type: 'CLEAR_FOCUS' }), PULSE_MS)
      return () => window.clearTimeout(clear)
    }
    const giveUp = window.setTimeout(() => {
      toast('This comment’s anchor was lost')
      dispatch({ type: 'CLEAR_PENDING_FOCUS' })
    }, timeoutMs)
    return () => window.clearTimeout(giveUp)
  }, [pendingFocusId, placed, getElement, dispatch, toast, timeoutMs])
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `cd packages/client && pnpm exec vitest run src/marker/useFocusPin.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/marker/useFocusPin.ts packages/client/src/marker/useFocusPin.test.tsx
git commit -m "M8: useFocusPin — wait-for-placement scroll+pulse, timeout to lost-anchor toast"
```

---

## Task 8: Navigation handoff (`navigate.ts`)

**Files:**
- Create: `packages/client/src/panel/navigate.ts`
- Test: `packages/client/src/panel/navigate.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/client/src/panel/navigate.test.ts
import { describe, expect, it, vi } from 'vitest'
import { FOCUS_STORAGE_KEY, goToThread, takeFocusHandoff } from './navigate'

function fakeStorage(seed: Record<string, string> = {}): Storage {
  const map = new Map(Object.entries(seed))
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
    clear: () => map.clear(),
    key: () => null,
    length: 0,
  } as Storage
}

describe('focus handoff', () => {
  it('takeFocusHandoff reads then clears the key (one-shot)', () => {
    const storage = fakeStorage({ [FOCUS_STORAGE_KEY]: 't1' })
    expect(takeFocusHandoff(storage)).toBe('t1')
    expect(takeFocusHandoff(storage)).toBeNull()
  })

  it('goToThread stashes the id and navigates to the page url', () => {
    const storage = fakeStorage()
    const assign = vi.fn()
    goToThread({ id: 't1', pageUrl: 'https://x.test/pricing' }, { storage, assign })
    expect(storage.getItem(FOCUS_STORAGE_KEY)).toBe('t1')
    expect(assign).toHaveBeenCalledWith('https://x.test/pricing')
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd packages/client && pnpm exec vitest run src/panel/navigate.test.ts`
Expected: FAIL — cannot find module `./navigate`.

- [ ] **Step 3: Write the implementation**

```ts
// packages/client/src/panel/navigate.ts
export const FOCUS_STORAGE_KEY = 'cmnt:focus'

/** Read the cross-page focus target and clear it so it fires exactly once on the destination page. */
export function takeFocusHandoff(storage: Storage = sessionStorage): string | null {
  try {
    const id = storage.getItem(FOCUS_STORAGE_KEY)
    if (id) storage.removeItem(FOCUS_STORAGE_KEY)
    return id
  } catch {
    return null
  }
}

export type NavigateDeps = { storage?: Storage; assign?: (url: string) => void }

/** Stash the focus target, then navigate to the thread's page (full reload or SPA route). */
export function goToThread(row: { id: string; pageUrl: string }, deps: NavigateDeps = {}): void {
  const storage = deps.storage ?? sessionStorage
  try {
    storage.setItem(FOCUS_STORAGE_KEY, row.id)
  } catch {
    /* storage unavailable — navigation still proceeds, just without auto-focus */
  }
  const assign = deps.assign ?? ((url: string) => void (window.location.href = url))
  assign(row.pageUrl)
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `cd packages/client && pnpm exec vitest run src/panel/navigate.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/panel/navigate.ts packages/client/src/panel/navigate.test.ts
git commit -m "M8: sessionStorage focus handoff (takeFocusHandoff + goToThread)"
```

---

## Task 9: `PanelRow`

**Files:**
- Create: `packages/client/src/panel/PanelRow.tsx`
- Test: `packages/client/src/panel/PanelRow.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// packages/client/src/panel/PanelRow.test.tsx
import type { ThreadListItem } from '@comments/core'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { PanelRow } from './PanelRow'

const item = (over: Partial<ThreadListItem> = {}): ThreadListItem =>
  ({
    id: 't1',
    status: 'open',
    anchorState: 'anchored',
    unresolvedCount: 2,
    pageUrl: 'https://x.test/pricing',
    pageTitle: 'Pricing',
    updatedAt: new Date(Date.now() - 5 * 60_000).toISOString(),
    createdBy: { email: 'a@b.c', name: 'Ann' },
    ...over,
  }) as ThreadListItem

describe('PanelRow', () => {
  it('shows page title, unresolved count and relative time, and calls onSelect', () => {
    const onSelect = vi.fn()
    render(<PanelRow item={item()} onSelect={onSelect} />)
    expect(screen.getByText('Pricing')).toBeInTheDocument()
    expect(screen.getByTestId('comments-panel-row')).toHaveTextContent(/2/)
    expect(screen.getByTestId('comments-panel-row')).toHaveTextContent(/5m/)
    fireEvent.click(screen.getByTestId('comments-panel-row'))
    expect(onSelect).toHaveBeenCalled()
  })

  it('falls back to the page url when there is no title', () => {
    render(<PanelRow item={item({ pageTitle: undefined })} onSelect={() => {}} />)
    expect(screen.getByText('https://x.test/pricing')).toBeInTheDocument()
  })

  it('shows an anchor-lost badge for orphaned threads', () => {
    render(<PanelRow item={item({ anchorState: 'orphaned' })} onSelect={() => {}} />)
    expect(screen.getByText(/anchor lost/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd packages/client && pnpm exec vitest run src/panel/PanelRow.test.tsx`
Expected: FAIL — cannot find module `./PanelRow`.

- [ ] **Step 3: Write the implementation**

```tsx
// packages/client/src/panel/PanelRow.tsx
import type { ThreadListItem } from '@comments/core'
import { cn } from '../lib/cn'
import { relativeTime } from '../threads/relativeTime'

export function PanelRow({ item, onSelect }: { item: ThreadListItem; onSelect: () => void }) {
  const resolved = item.status === 'resolved'
  const orphaned = item.anchorState === 'orphaned'
  return (
    <button
      type="button"
      data-testid="comments-panel-row"
      data-thread-id={item.id}
      onClick={onSelect}
      className="cmnt:w-full cmnt:flex cmnt:items-start cmnt:gap-2 cmnt:px-3 cmnt:py-2.5 cmnt:text-left cmnt:bg-transparent cmnt:border-none cmnt:border-b cmnt:border-[#f1f3f5] cmnt:cursor-pointer hover:cmnt:bg-gray-50"
    >
      <span
        aria-hidden={true}
        className={cn(
          'cmnt:mt-1 cmnt:w-2 cmnt:h-2 cmnt:rounded-full cmnt:shrink-0',
          resolved ? 'cmnt:bg-gray-400' : 'cmnt:bg-blue-600',
        )}
      />
      <span className="cmnt:flex-1 cmnt:min-w-0">
        <span className="cmnt:block cmnt:text-[13px] cmnt:text-gray-900 cmnt:truncate">
          {item.pageTitle ?? item.pageUrl}
        </span>
        <span className="cmnt:mt-0.5 cmnt:flex cmnt:items-center cmnt:gap-1.5 cmnt:text-[11px] cmnt:text-gray-500">
          <span>{resolved ? 'Resolved' : `${item.unresolvedCount} open`}</span>
          <span aria-hidden={true}>·</span>
          <span>{relativeTime(item.updatedAt)}</span>
          {orphaned && (
            <span className="cmnt:ml-1 cmnt:px-1.5 cmnt:py-0.5 cmnt:rounded cmnt:bg-amber-100 cmnt:text-amber-700 cmnt:font-medium">
              ⚠ anchor lost
            </span>
          )}
        </span>
      </span>
    </button>
  )
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `cd packages/client && pnpm exec vitest run src/panel/PanelRow.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/panel/PanelRow.tsx packages/client/src/panel/PanelRow.test.tsx
git commit -m "M8: PanelRow — title/url, count, relative time, anchor-lost badge"
```

---

## Task 10: `PanelDrawer` (header, filter, sections, list, load more, row routing, reconciliation)

**Files:**
- Create: `packages/client/src/panel/PanelDrawer.tsx`
- Test: `packages/client/src/panel/PanelDrawer.test.tsx`

`PanelDrawer` consumes `usePanelState`/`usePanelController` and the threads `useController`. It routes row clicks: same page → `requestFocus` + close; different page → `goToThread`. It registers a status listener that refetches while open.

- [ ] **Step 1: Write the failing test**

```tsx
// packages/client/src/panel/PanelDrawer.test.tsx
import type { ThreadListItem } from '@comments/core'
import { render, screen, waitFor } from '@testing-library/react'
import { act } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { WidgetProvider } from '../app/providers'
import { ThreadsProvider } from '../threads/ThreadsProvider'
import { PanelProvider, usePanelController } from './PanelProvider'
import { PanelDrawer } from './PanelDrawer'
import { FOCUS_STORAGE_KEY } from './navigate'

const item = (over: Partial<ThreadListItem>): ThreadListItem =>
  ({
    id: 'x',
    status: 'open',
    anchorState: 'anchored',
    unresolvedCount: 1,
    pageUrl: 'https://x.test/pricing',
    pageKey: 'x.test/pricing',
    updatedAt: new Date().toISOString(),
    createdBy: { email: 'a@b.c', name: 'Ann' },
    ...over,
  }) as ThreadListItem

function Opener() {
  const c = usePanelController()
  return <button type="button" onClick={() => void c.openPanel()}>open</button>
}

function setup(opts: {
  threads: ThreadListItem[]
  review?: ThreadListItem[]
  resolvePageKey?: (url: string) => string
}) {
  // The main fetch carries `sort: 'updatedAt'`; the review fetch sends only `status`.
  // Distinguish the two by the presence of `sort`.
  const client = {
    listThreads: vi.fn(async (p: { sort?: string; status?: string }) =>
      p.sort
        ? { threads: opts.threads, nextCursor: null }
        : { threads: opts.review ?? [], nextCursor: null },
    ),
    getThread: vi.fn().mockResolvedValue({ id: 'x', status: 'open', comments: [] }),
  }
  const resolvePageKey = opts.resolvePageKey ?? (() => 'x.test/other')
  render(
    <WidgetProvider>
      <ThreadsProvider client={client as never}>
        <PanelProvider client={client as never}>
          <Opener />
          <PanelDrawer resolvePageKey={resolvePageKey} />
        </PanelProvider>
      </ThreadsProvider>
    </WidgetProvider>,
  )
  return { client }
}

describe('PanelDrawer', () => {
  beforeEach(() => window.sessionStorage.clear())

  it('renders rows once opened and hides the drawer until then', async () => {
    setup({ threads: [item({ id: 'a' }), item({ id: 'b' })] })
    expect(screen.queryByTestId('comments-panel')).not.toBeInTheDocument()
    screen.getByText('open').click()
    await waitFor(() => expect(screen.getAllByTestId('comments-panel-row')).toHaveLength(2))
  })

  it('shows a Needs-review section for open orphans and excludes them from the main list', async () => {
    setup({
      threads: [item({ id: 'a' }), item({ id: 'orph', anchorState: 'orphaned' })],
      review: [item({ id: 'orph', anchorState: 'orphaned' })],
    })
    screen.getByText('open').click()
    await waitFor(() => expect(screen.getByTestId('comments-needs-review')).toBeInTheDocument())
    // 'orph' appears once (in review), 'a' once (in main) → 2 rows total, not 3
    await waitFor(() => expect(screen.getAllByTestId('comments-panel-row')).toHaveLength(2))
  })

  it('cross-page row click stashes the focus id (then navigates)', async () => {
    // Different page (resolvePageKey returns a key that does not match the row's pageKey).
    // We assert only the deterministic, observable effect: the focus id is written to
    // sessionStorage. The navigation itself (window.location.href = pageUrl) is a no-op in
    // jsdom and is unit-tested in navigate.test.ts via the injected `assign`.
    setup({ threads: [item({ id: 'a', pageKey: 'x.test/pricing' })], resolvePageKey: () => 'x.test/other' })
    screen.getByText('open').click()
    await waitFor(() => screen.getByTestId('comments-panel-row'))
    act(() => screen.getByTestId('comments-panel-row').click())
    expect(window.sessionStorage.getItem(FOCUS_STORAGE_KEY)).toBe('a')
  })

  it('same-page row click closes the drawer and writes no handoff', async () => {
    setup({ threads: [item({ id: 'a', pageKey: 'x.test/here' })], resolvePageKey: () => 'x.test/here' })
    screen.getByText('open').click()
    await waitFor(() => screen.getByTestId('comments-panel-row'))
    act(() => screen.getByTestId('comments-panel-row').click())
    await waitFor(() => expect(screen.queryByTestId('comments-panel')).not.toBeInTheDocument())
    expect(window.sessionStorage.getItem(FOCUS_STORAGE_KEY)).toBeNull()
  })
})
```

> jsdom note: setting `window.location.href` logs a "Not implemented: navigation" message to the virtual console but does **not** throw, so the cross-page handler runs to completion. The tests therefore assert the observable sessionStorage write rather than spying on `location` (which is brittle in jsdom). The actual `assign` wiring is covered in `navigate.test.ts` (Task 8).

- [ ] **Step 2: Run it to verify it fails**

Run: `cd packages/client && pnpm exec vitest run src/panel/PanelDrawer.test.tsx`
Expected: FAIL — cannot find module `./PanelDrawer`.

- [ ] **Step 3: Write the implementation**

```tsx
// packages/client/src/panel/PanelDrawer.tsx
import * as Dialog from '@radix-ui/react-dialog'
import { useEffect } from 'react'
import { usePortalContainer } from '../app/providers'
import { cn } from '../lib/cn'
import { useController } from '../threads/useThreads'
import { goToThread } from './navigate'
import { PanelRow } from './PanelRow'
import { usePanelController, usePanelState } from './PanelProvider'
import { mainListExcludingReview, type PanelFilter } from './state'

const FILTERS: { value: PanelFilter; label: string }[] = [
  { value: 'open', label: 'Open' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'all', label: 'All' },
]

export type PanelDrawerProps = {
  resolvePageKey: (url: string) => string
}

export function PanelDrawer({ resolvePageKey }: PanelDrawerProps) {
  const state = usePanelState()
  const panel = usePanelController()
  const threads = useController()
  const container = usePortalContainer()
  const mainList = mainListExcludingReview(state)

  // Drawer-open reconciliation: when a status change persists, refetch the current filter.
  useEffect(() => {
    if (!state.open) return
    threads.registerStatusListener(() => void panel.refresh())
    return () => threads.registerStatusListener(null)
  }, [state.open, threads, panel])

  function onSelect(row: { id: string; pageKey: string | null; pageUrl: string }) {
    const here = resolvePageKey(window.location.href)
    if (row.pageKey === here) {
      panel.closePanel()
      threads.requestFocus(row.id)
    } else {
      goToThread({ id: row.id, pageUrl: row.pageUrl })
    }
  }

  return (
    <Dialog.Root open={state.open} modal={false} onOpenChange={(o) => !o && panel.closePanel()}>
      <Dialog.Portal container={container ?? undefined}>
        <Dialog.Content
          data-testid="comments-panel"
          onInteractOutside={(e) => e.preventDefault()}
          className="cmnt:fixed cmnt:top-0 cmnt:right-0 cmnt:bottom-0 cmnt:w-[360px] cmnt:max-w-[calc(100vw-16px)] cmnt:bg-white cmnt:border-l cmnt:border-gray-200 cmnt:flex cmnt:flex-col cmnt:pointer-events-auto cmnt:shadow-[-8px_0_24px_rgba(0,0,0,0.12)]"
        >
          <div className="cmnt:flex cmnt:items-center cmnt:justify-between cmnt:px-3 cmnt:py-2.5 cmnt:border-b cmnt:border-gray-200">
            <Dialog.Title className="cmnt:text-sm cmnt:font-semibold cmnt:text-gray-900">
              Comments
            </Dialog.Title>
            <Dialog.Close
              aria-label="Close panel"
              className="cmnt:border-none cmnt:bg-transparent cmnt:cursor-pointer cmnt:text-gray-500 cmnt:px-1"
            >
              ✕
            </Dialog.Close>
          </div>

          <div
            role="radiogroup"
            aria-label="Filter threads"
            className="cmnt:flex cmnt:gap-1 cmnt:px-3 cmnt:py-2 cmnt:border-b cmnt:border-gray-200"
          >
            {FILTERS.map((f) => (
              <button
                key={f.value}
                type="button"
                role="radio"
                aria-checked={state.filter === f.value}
                onClick={() => void panel.setFilter(f.value)}
                className={cn(
                  'cmnt:rounded-full cmnt:px-3 cmnt:py-1 cmnt:text-xs cmnt:font-medium cmnt:border cmnt:cursor-pointer',
                  state.filter === f.value
                    ? 'cmnt:bg-blue-600 cmnt:text-white cmnt:border-blue-600'
                    : 'cmnt:bg-white cmnt:text-gray-600 cmnt:border-gray-200',
                )}
              >
                {f.label}
              </button>
            ))}
          </div>

          <div className="cmnt:flex-1 cmnt:overflow-y-auto">
            {state.needsReview.length > 0 && (
              <div data-testid="comments-needs-review">
                <div className="cmnt:px-3 cmnt:py-1.5 cmnt:text-[11px] cmnt:font-semibold cmnt:text-amber-700 cmnt:bg-amber-50">
                  ⚠ Needs review ({state.needsReview.length})
                </div>
                {state.needsReview.map((t) => (
                  <PanelRow key={t.id} item={t} onSelect={() => onSelect(t)} />
                ))}
                <div className="cmnt:h-px cmnt:bg-gray-200" />
              </div>
            )}

            {state.loading && (
              <div data-testid="comments-panel-loading" className="cmnt:px-3 cmnt:py-6 cmnt:text-center cmnt:text-xs cmnt:text-gray-400">
                Loading…
              </div>
            )}

            {state.error && !state.loading && (
              <div className="cmnt:px-3 cmnt:py-6 cmnt:text-center cmnt:text-xs cmnt:text-gray-500">
                Couldn’t load comments.
                <button
                  type="button"
                  onClick={() => void panel.refresh()}
                  className="cmnt:ml-1 cmnt:underline cmnt:bg-transparent cmnt:border-none cmnt:cursor-pointer cmnt:text-blue-600"
                >
                  Retry
                </button>
              </div>
            )}

            {!state.loading && !state.error && mainList.length === 0 && state.needsReview.length === 0 && (
              <div data-testid="comments-panel-empty" className="cmnt:px-3 cmnt:py-6 cmnt:text-center cmnt:text-xs cmnt:text-gray-400">
                No comments yet
              </div>
            )}

            {mainList.map((t) => (
              <PanelRow key={t.id} item={t} onSelect={() => onSelect(t)} />
            ))}

            {state.nextCursor && (
              <button
                type="button"
                data-testid="comments-panel-loadmore"
                onClick={() => void panel.loadMore()}
                disabled={state.loadingMore}
                className="cmnt:w-full cmnt:py-2.5 cmnt:text-xs cmnt:font-medium cmnt:text-blue-600 cmnt:bg-transparent cmnt:border-none cmnt:border-t cmnt:border-gray-200 cmnt:cursor-pointer"
              >
                {state.loadingMore ? 'Loading…' : 'Load more'}
              </button>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `cd packages/client && pnpm exec vitest run src/panel/PanelDrawer.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/panel/PanelDrawer.tsx packages/client/src/panel/PanelDrawer.test.tsx
git commit -m "M8: PanelDrawer — filter, Needs-review, list, load-more, row routing, refetch"
```

---

## Task 11: Launcher panel button

**Files:**
- Modify: `packages/client/src/ui/Launcher.tsx`
- Test: `packages/client/src/ui/Launcher.test.tsx` (append a case)

- [ ] **Step 1: Write the failing test (append)**

```tsx
// append in packages/client/src/ui/Launcher.test.tsx
it('opens the panel via the list button', () => {
  const onTogglePanel = vi.fn()
  render(
    <Launcher
      placing={false}
      onTogglePlace={() => {}}
      showResolved={false}
      onShowResolved={() => {}}
      openCount={0}
      onTogglePanel={onTogglePanel}
    />,
  )
  fireEvent.click(screen.getByRole('button', { name: /comments panel/i }))
  expect(onTogglePanel).toHaveBeenCalled()
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd packages/client && pnpm exec vitest run src/ui/Launcher.test.tsx`
Expected: FAIL — `onTogglePanel` prop / button not present.

- [ ] **Step 3: Edit `Launcher.tsx`**

Add `onTogglePanel` to `LauncherProps`:

```ts
export type LauncherProps = {
  placing: boolean
  onTogglePlace: () => void
  showResolved: boolean
  onShowResolved: (value: boolean) => void
  openCount: number
  onTogglePanel: () => void
}
```

Destructure `onTogglePanel`, and add a list button as the first child inside the outer `<div>` (before the resolved switch):

```tsx
      <button
        type="button"
        aria-label="Open comments panel"
        data-testid="comments-panel-open"
        onClick={onTogglePanel}
        className="cmnt:inline-flex cmnt:items-center cmnt:justify-center cmnt:w-7 cmnt:h-7 cmnt:rounded-full cmnt:bg-transparent cmnt:border-none cmnt:cursor-pointer cmnt:text-gray-500 hover:cmnt:bg-gray-100"
      >
        <span aria-hidden={true}>☰</span>
      </button>
```

- [ ] **Step 4: Run it to verify it passes**

Run: `cd packages/client && pnpm exec vitest run src/ui/Launcher.test.tsx`
Expected: PASS (existing + new).

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/ui/Launcher.tsx packages/client/src/ui/Launcher.test.tsx
git commit -m "M8: Launcher — list button to open the comments panel"
```

---

## Task 12: Wire MarkerLayer (panel button, focus effect, boot handoff)

**Files:**
- Modify: `packages/client/src/marker/MarkerLayer.tsx`
- Test: `packages/client/src/marker/MarkerLayer.test.tsx` (create)

MarkerLayer already owns `runtime`, `state`, `controller`, and `toast`. Add: pass `onTogglePanel` to the Launcher; drive `useFocusPin` from store state; consume the boot handoff after the first `refresh()`.

- [ ] **Step 1: Write the failing test**

```tsx
// packages/client/src/marker/MarkerLayer.test.tsx
import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { WidgetProvider } from '../app/providers'
import { ThreadsProvider } from '../threads/ThreadsProvider'
import { ToastProvider } from '../ui/toast'
import { PanelDrawer } from '../panel/PanelDrawer'
import { PanelProvider } from '../panel/PanelProvider'
import { FOCUS_STORAGE_KEY } from '../panel/navigate'
import { MarkerLayer } from './MarkerLayer'

// MarkerLayer owns the Launcher (and its panel button); the drawer is a sibling rendered by
// app.tsx. We render PanelDrawer alongside here so "open the panel" is observable end-to-end.
function renderLayer(client: unknown) {
  return render(
    <WidgetProvider>
      <ToastProvider>
        <ThreadsProvider client={client as never}>
          <PanelProvider client={client as never}>
            <MarkerLayer
              client={client as never}
              pageKey="x.test/here"
              pageUrl="https://x.test/here"
              resolvePageKey={() => 'x.test/here'}
              identity={null}
              onNeedIdentity={() => {}}
            />
            <PanelDrawer resolvePageKey={() => 'x.test/here'} />
          </PanelProvider>
        </ThreadsProvider>
      </ToastProvider>
    </WidgetProvider>,
  )
}

describe('MarkerLayer panel integration', () => {
  beforeEach(() => window.sessionStorage.clear())

  it('opens the panel from the Launcher list button', async () => {
    const client = {
      listThreads: vi.fn(async () => ({ threads: [], nextCursor: null })),
      refreshAnchor: vi.fn(),
      getThread: vi.fn(),
    }
    renderLayer(client)
    screen.getByTestId('comments-panel-open').click()
    await waitFor(() => expect(screen.getByTestId('comments-panel')).toBeInTheDocument())
  })

  it('consumes a boot focus handoff after the first refresh', async () => {
    window.sessionStorage.setItem(FOCUS_STORAGE_KEY, 't1')
    const getThread = vi.fn().mockResolvedValue({ id: 't1', status: 'open', comments: [] })
    const client = {
      listThreads: vi.fn(async () => ({ threads: [], nextCursor: null })),
      refreshAnchor: vi.fn(),
      getThread,
    }
    renderLayer(client)
    // boot handoff → controller.requestFocus('t1') → lazy getThread('t1')
    await waitFor(() => expect(getThread).toHaveBeenCalledWith('t1'))
    expect(window.sessionStorage.getItem(FOCUS_STORAGE_KEY)).toBeNull()
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd packages/client && pnpm exec vitest run src/marker/MarkerLayer.test.tsx`
Expected: FAIL — Launcher has no `onTogglePanel` wired / handoff not consumed.

- [ ] **Step 3: Edit `MarkerLayer.tsx`**

Add imports (the panel hooks are exported from `PanelProvider`):

```tsx
import { usePanelController } from '../panel/PanelProvider'
import { takeFocusHandoff } from '../panel/navigate'
import { useFocusPin } from './useFocusPin'
```

Inside the component, read the panel controller and derive focus inputs:

```tsx
  const panel = usePanelController()
  const pendingFocusId = state.pendingFocusId
  const placed = pendingFocusId ? Boolean(state.placementsById[pendingFocusId]) : false

  useFocusPin({
    pendingFocusId,
    placed,
    getElement: (id) => runtime.current?.placed.find((p) => p.item.id === id)?.el ?? null,
    dispatch,
    toast,
  })
```

In the runtime `useEffect`, change `void rt.refresh()` to consume the handoff after the first refresh resolves:

```tsx
    void rt.refresh().then(() => {
      const focusId = takeFocusHandoff()
      if (focusId) controller.requestFocus(focusId)
    })
```

Pass `onTogglePanel` to the `Launcher`:

```tsx
      <Launcher
        placing={placing}
        onTogglePlace={() => setPlacing((p) => !p)}
        showResolved={state.showResolved}
        onShowResolved={(v) => controller.setShowResolved(v)}
        openCount={openCount}
        onTogglePanel={() => void panel.openPanel()}
      />
```

> `runtime.current.placed` is exposed by `createRuntime` (a getter returning the retained matches with their `.el`). No runtime change needed.

- [ ] **Step 4: Run it to verify it passes**

Run: `cd packages/client && pnpm exec vitest run src/marker/MarkerLayer.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/marker/MarkerLayer.tsx packages/client/src/marker/MarkerLayer.test.tsx
git commit -m "M8: MarkerLayer — panel button, focus effect, boot handoff"
```

---

## Task 13: Mount the panel in the app

**Files:**
- Modify: `packages/client/src/app/app.tsx`
- Test: `packages/client/src/app/app.test.tsx` (append a smoke case)

- [ ] **Step 1: Write the failing test (append)**

```tsx
// append a new `it` inside the existing describe block in packages/client/src/app/app.test.tsx.
// Reuse the file's existing `mockClient()` helper and its render/screen/WidgetApp imports.
it('renders the Launcher panel button (panel mounted)', () => {
  render(<WidgetApp options={{ key: 'k', endpoint: 'https://api.test' }} client={mockClient()} />)
  expect(screen.getByTestId('comments-panel-open')).toBeInTheDocument()
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd packages/client && pnpm exec vitest run src/app/app.test.tsx`
Expected: FAIL — no `comments-panel-open` (panel not mounted yet), or earlier failure because `WidgetApp` doesn't yet wrap `PanelProvider`.

- [ ] **Step 3: Edit `app.tsx`**

Add imports:

```tsx
import { PanelProvider } from '../panel/PanelProvider'
import { PanelDrawer } from '../panel/PanelDrawer'
```

Wrap the `MarkerLayer` + `IdentityModal` subtree with `PanelProvider`, and render `PanelDrawer` next to `MarkerLayer`:

```tsx
          <ThreadsProvider client={client}>
            <PanelProvider client={client}>
              <MarkerLayer
                client={client}
                pageKey={pageKey}
                pageUrl={pageUrl}
                resolvePageKey={(url) => resolvePageKey(options, url)}
                identity={identity}
                onNeedIdentity={onNeedIdentity}
                provenance={options.provenance}
              />
              <PanelDrawer resolvePageKey={(url) => resolvePageKey(options, url)} />
              <IdentityModal
                open={modalOpen}
                onOpenChange={(open) => {
                  if (!open) resumeRef.current = null
                  setModalOpen(open)
                }}
                onSubmit={onSubmitIdentity}
              />
            </PanelProvider>
          </ThreadsProvider>
```

- [ ] **Step 4: Run it to verify it passes**

Run: `cd packages/client && pnpm exec vitest run src/app/app.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/app/app.tsx packages/client/src/app/app.test.tsx
git commit -m "M8: mount PanelProvider + PanelDrawer in the widget app"
```

---

## Task 14: Full verification (build · typecheck · test · size)

**Files:** none (verification only).

- [ ] **Step 1: Run the full client test suite**

Run: `cd packages/client && pnpm test`
Expected: PASS — all suites green, including the new panel/focus tests.

- [ ] **Step 2: Typecheck + build**

Run: `cd packages/client && pnpm build`
Expected: tsup + `tsc --build` succeed with no type errors. (If you hit a stale "cannot find declaration for @comments/*", purge `~/.turbo` + `*.tsbuildinfo` — see project memory `turbo-cache-dts-corruption`.)

- [ ] **Step 3: Lint**

Run: `pnpm lint` (from repo root)
Expected: no Biome errors in `packages/client/src/panel`, `marker`, `ui`, `threads`.

- [ ] **Step 4: Bundle-size budget**

Run: `cd packages/client && pnpm size`
Expected: `dist/index.js` stays within the 300 kB brotli limit. (Radix Dialog is already a dependency, so the delta is small; if it regresses the budget, note it for the milestone review rather than silently raising the limit.)

- [ ] **Step 5: Update the milestone status**

In `docs/milestones.md`, under **M8**, add a `Design`/`Plan` ref line mirroring M5/M7 (e.g. `Design [specs/2026-06-01-m8-cross-page-panel-design.md]; Plan [plans/2026-06-01-m8-cross-page-panel.md]`). Commit:

```bash
git add docs/milestones.md
git commit -m "M8: link design + plan from the milestones roadmap"
```

---

## Self-review notes (coverage against the spec)

- **All-pages list, updatedAt order, no client re-sort** → Tasks 1–3, 10 (`mainListExcludingReview` preserves server order).
- **Two fetches; needs-review from a separate `?status=open` filtered to `orphaned`** → Task 2 (`load`), Task 10 (section + dedupe).
- **Pinned Needs-review section, stays visible under any filter** → Task 10 (rendered from `state.needsReview`, independent of `state.filter`).
- **Right slide-over, non-modal, from the Launcher** → Tasks 10, 11, 13.
- **Open/Resolved/All filter, default Open** → Tasks 1, 2, 10.
- **Load more (cursor)** → Tasks 1, 2, 10.
- **Navigate-only rows; same-page vs cross-page routing** → Tasks 8, 10.
- **sessionStorage handoff consumed on boot** → Tasks 8, 12.
- **`focusThread` waits for placement, scroll + pulse, orphan → toast** → Tasks 4, 5, 6, 7, 12.
- **Reconciliation: refetch while open on status commit** → Tasks 5, 10.
- **Reply-driven reopen reconciliation:** the in-popover reply-reopen path persists via `client.setThreadStatus` directly (not `controller.setStatus`), so it does **not** trigger the panel refetch. This is acceptable for v1 — the panel re-fetches fresh on its next open. (Spec §4 promises refetch on the resolve/reopen commit, which goes through `controller.setStatus`.)
- **No schema/contract/backend changes** → confirmed; only `packages/client/src` is touched.

## Out of scope (do not build)

Notifications, inbox, search, per-row resolve/reopen, grouping by page, infinite scroll, deep-linkable `#` anchors.
