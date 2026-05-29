# M7 Commenting UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn M6's anchored pin dots into the full on-page commenting product — clickable teardrop pins, a thread popover with comments/replies, screenshot upload, resolve/reopen, and a launcher with a show-resolved toggle.

**Architecture:** A threads **store** (`useReducer` in a `ThreadsProvider`) holds list metadata, geometry, the open thread id, lazily-fetched thread detail, and a *draft* (un-created) thread. An imperative **controller** (`openThread`/`close`/`setShowResolved`) is the seam M8 reuses. M6's anchoring runtime is unchanged except for the shape it emits: it now feeds the store `PlacedThread[]` (geometry + the `ThreadListItem` it already fetched) instead of bare placements. Pins, popover, composer, and launcher are presentational/Radix components driven by the store. No HTTP contract or schema changes — every endpoint already exists on the M5 `ApiClient`.

**Tech Stack:** TypeScript, React 19, `@radix-ui/react-popover` (new) + `@radix-ui/react-dialog` (existing), **Tailwind v4 (`cmnt:` prefix) via `cn()`** for styling, Vitest + `@testing-library/react` (jsdom), Biome. Source of truth: `docs/superpowers/specs/2026-05-29-m7-commenting-ui-design.md`.

---

## Conventions used in every task

- **Run one test file:** `pnpm --filter @comments/client exec vitest run <relative-path>`
- **Run all client tests:** `pnpm --filter @comments/client test`
- **Typecheck:** `pnpm --filter @comments/client exec tsc --build`
- **Format/lint (Biome):** `pnpm format` (writes fixes), then `pnpm lint` (CI check)
- All new files live under `packages/client/src/`. Paths below are relative to the repo root.
- The widget host is `position: fixed; inset: 0; pointer-events: none`; the overlay is `position: absolute; inset: 0`. Pin/highlight coords are **viewport-relative** (see `src/positioning/coords.ts`) — never add scroll offset.
- Commit after every task with the exact message shown.

### Styling convention (Tailwind `cmnt:` prefix)

M5 set up **Tailwind v4 with a `cmnt:` prefix** (preflight disabled), compiled by `scripts/build-css.mjs` from `src/app/widget.css` into `src/app/widget-css.generated.ts` and injected as a `<style>` in the host. A `cn()` helper (`src/lib/cn.ts`, `clsx` + `tailwind-merge`) composes class names. **All static styling in M7 uses `cmnt:` utilities composed with `cn()`** — layout, color, radius, typography, hover/focus, transitions, `cmnt:animate-spin`, etc. Compose conditional classes with `cn()` (e.g. `cn('cmnt:bg-blue-600', resolved && 'cmnt:bg-gray-400')`).

**Use inline `style={{…}}` ONLY for:**
1. **Runtime-computed values** — pin/highlight/draft coordinates (`transform: translate(${x}px, ${y}px)`) and the per-author avatar color (`avatarColor(email)` returns a dynamic `hsl()`).
2. **One-off non-utility CSS** where a class adds no value — specifically the teardrop's `borderRadius: '50% 50% 50% 0'` + `transform: rotate(-45deg)`.

This is exactly how the existing `Launcher`/`MarkerLayer` button already works (`className="cmnt:rounded-full cmnt:shadow-lg"` + inline positioning). Tailwind color tokens map cleanly to the mockups: `blue-600`=#2563eb, `blue-800`=#1e40af, `gray-900`=#111827, `gray-500`=#6b7280, `gray-400`=#9ca3af, `gray-300`=#d1d5db, `gray-200`=#e5e7eb, `green-600`=#16a34a, `white`=#fff. Use arbitrary values (`cmnt:w-80`, `cmnt:text-[13px]`, `cmnt:border-[#f1f3f5]`) where no token fits.

> **jsdom note:** the compiled `cmnt:` CSS is **not** loaded in the vitest DOM, so classes render with no visual effect in tests. That's fine — every M7 test asserts on roles / text / `data-testid`, never on computed pixels. Newly-`cmnt:`-classed markup is picked up by `@source "../**/*.{ts,tsx}"`; run `pnpm --filter @comments/client build:css` after adding components if you want the class to exist in the generated CSS, but it is not required for tests to pass.

---

## File Structure

**Create:**
- `src/threads/relativeTime.ts` — pure relative-time formatter ("just now", "2h").
- `src/threads/state.ts` — pure reducer, action types, `PlacedThread`/`Draft` types, `visiblePlacements` selector.
- `src/threads/ThreadsProvider.tsx` — context + `useReducer` + instantiates the controller; exposes state/dispatch/controller.
- `src/threads/controller.ts` — `createController(dispatch, deps)` → `{ openThread, close, setShowResolved }` (the M8 seam; triggers lazy `getThread`).
- `src/threads/useThreads.ts` — hooks: `useThreadsState()`, `useController()`, `useVisiblePlacements()`, `useOpenThread()`.
- `src/ui/avatar.ts` — pure `initials(author)` + `avatarColor(seed)`.
- `src/ui/Pin.tsx` — presentational teardrop pin (forwardRef button) — open/resolved states + count pill.
- `src/ui/ThreadPopover.tsx` — Radix `Popover` per thread: pin trigger + header (resolve/reopen/close) + `CommentList` + `Composer`.
- `src/ui/CommentList.tsx` — comments (avatar, name, relative time, text, attachments), loading skeleton, empty state.
- `src/ui/Composer.tsx` — growing text input + attach + send; new-thread & reply modes; identity gate; optimistic.
- `src/ui/Attachment.tsx` — pending thumbnail (spinner / remove / error-retry) + sent image.
- `src/ui/Launcher.tsx` — floating cluster: "+ Comment" place-mode toggle + show-resolved switch + open count.

**Modify:**
- `packages/client/package.json` — add `@radix-ui/react-popover` dependency.
- `src/positioning/layer.tsx` — replace `Placement` with `PlacedThread`; `PinLayer` renders highlights + maps placements to `ThreadPopover`.
- `src/anchor/runtime.ts` — retained record carries `item: ThreadListItem`; `onPlacements` emits `PlacedThread[]`.
- `src/marker/MarkerLayer.tsx` — slimmed: owns place-mode capture + draft lifecycle; wires runtime → store; renders `Launcher` + `PinLayer` + draft popover + orphan toast.
- `src/app/app.tsx` — wrap in `ThreadsProvider`; pass `client` to it.
- Test files alongside each (`*.test.ts(x)`), plus updates to existing `src/anchor/runtime.test.ts`, `src/positioning/layer.test.tsx`, `src/marker/MarkerLayer.test.tsx`.

---

## Task 1: Pure relative-time formatter

**Files:**
- Create: `packages/client/src/threads/relativeTime.ts`
- Test: `packages/client/src/threads/relativeTime.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/client/src/threads/relativeTime.test.ts
import { describe, expect, it } from 'vitest'
import { relativeTime } from './relativeTime'

const now = Date.parse('2026-05-29T12:00:00.000Z')

describe('relativeTime', () => {
  it('returns "just now" under a minute', () => {
    expect(relativeTime('2026-05-29T11:59:30.000Z', now)).toBe('just now')
  })
  it('returns minutes', () => {
    expect(relativeTime('2026-05-29T11:45:00.000Z', now)).toBe('15m')
  })
  it('returns hours', () => {
    expect(relativeTime('2026-05-29T10:00:00.000Z', now)).toBe('2h')
  })
  it('returns days', () => {
    expect(relativeTime('2026-05-26T12:00:00.000Z', now)).toBe('3d')
  })
  it('returns a date past a week', () => {
    expect(relativeTime('2026-05-01T12:00:00.000Z', now)).toMatch(/May/)
  })
  it('clamps future timestamps to "just now"', () => {
    expect(relativeTime('2026-05-29T12:05:00.000Z', now)).toBe('just now')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @comments/client exec vitest run src/threads/relativeTime.test.ts`
Expected: FAIL — `Failed to resolve import "./relativeTime"`.

- [ ] **Step 3: Write the implementation**

```ts
// packages/client/src/threads/relativeTime.ts

/** Compact relative time: "just now", "15m", "2h", "3d", then an absolute date. Pure (now injectable). */
export function relativeTime(iso: string, now: number = Date.now()): string {
  const then = Date.parse(iso)
  if (Number.isNaN(then)) return ''
  const secs = Math.max(0, Math.round((now - then) / 1000))
  if (secs < 60) return 'just now'
  const mins = Math.floor(secs / 60)
  if (mins < 60) return `${mins}m`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d`
  return new Date(then).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @comments/client exec vitest run src/threads/relativeTime.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/threads/relativeTime.ts packages/client/src/threads/relativeTime.test.ts
git commit -m "M7: pure relativeTime formatter"
```

---

## Task 2: Threads store — reducer, types, selector

This is the heart of the store. It is pure and headless-testable. Defines `PlacedThread`/`Draft` (reused by the runtime and layer in Task 3) and the reducer with the spec's invariants: ingest preserves open/detail/draft; opening clears draft; an open thread that drops out of an ingest is reported via `lostOpenId`.

**Files:**
- Create: `packages/client/src/threads/state.ts`
- Test: `packages/client/src/threads/state.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/client/src/threads/state.test.ts
import type { Comment, Thread, ThreadListItem } from '@comments/core'
import { describe, expect, it } from 'vitest'
import { initialState, reducer, visiblePlacements } from './state'
import type { PlacedThread } from './state'

const item = (id: string, status: 'open' | 'resolved' = 'open'): ThreadListItem =>
  ({
    id,
    status,
    anchorState: 'anchored',
    unresolvedCount: status === 'open' ? 1 : 0,
    commentCount: 1,
    createdBy: { email: 'a@b.c', name: 'Ann' },
    anchor: { offset: { fx: 0.5, fy: 0.5 } },
  }) as unknown as ThreadListItem

const placed = (id: string, status: 'open' | 'resolved' = 'open'): PlacedThread => ({
  item: item(id, status),
  pin: { x: 10, y: 20 },
  highlight: [],
})

const thread = (id: string): Thread =>
  ({ id, status: 'open', comments: [] }) as unknown as Thread

const comment = (id: string): Comment =>
  ({ id, author: { email: 'a@b.c' }, text: 'hi', attachments: [], createdAt: 'x' }) as unknown as Comment

describe('threads reducer', () => {
  it('INGEST_PLACEMENTS populates items/placements/order', () => {
    const s = reducer(initialState, { type: 'INGEST_PLACEMENTS', placements: [placed('a'), placed('b')] })
    expect(s.order).toEqual(['a', 'b'])
    expect(s.itemsById.a.id).toBe('a')
    expect(s.placementsById.b.pin).toEqual({ x: 10, y: 20 })
  })

  it('INGEST_PLACEMENTS preserves openId, detail, and draft', () => {
    let s = reducer(initialState, { type: 'INGEST_PLACEMENTS', placements: [placed('a')] })
    s = reducer(s, { type: 'OPEN', id: 'a' })
    s = reducer(s, { type: 'DETAIL_LOADED', id: 'a', thread: thread('a') })
    const next = reducer(s, { type: 'INGEST_PLACEMENTS', placements: [placed('a')] })
    expect(next.openId).toBe('a')
    expect(next.detailById.a).toBeDefined()
  })

  it('INGEST_PLACEMENTS clears openId and records lostOpenId when the open thread orphans away', () => {
    let s = reducer(initialState, { type: 'INGEST_PLACEMENTS', placements: [placed('a')] })
    s = reducer(s, { type: 'OPEN', id: 'a' })
    const next = reducer(s, { type: 'INGEST_PLACEMENTS', placements: [placed('b')] })
    expect(next.openId).toBeNull()
    expect(next.lostOpenId).toBe('a')
  })

  it('OPEN clears any draft and sets openId', () => {
    let s = reducer(initialState, {
      type: 'SET_DRAFT',
      draft: { anchor: {} as never, point: { x: 1, y: 2 }, pin: { x: 1, y: 2 } },
    })
    expect(s.draft).not.toBeNull()
    s = reducer(s, { type: 'OPEN', id: 'a' })
    expect(s.draft).toBeNull()
    expect(s.openId).toBe('a')
  })

  it('SET_DRAFT closes any open thread; CLEAR_DRAFT removes it', () => {
    let s = reducer({ ...initialState, openId: 'a' }, {
      type: 'SET_DRAFT',
      draft: { anchor: {} as never, point: { x: 0, y: 0 }, pin: { x: 0, y: 0 } },
    })
    expect(s.openId).toBeNull()
    s = reducer(s, { type: 'CLEAR_DRAFT' })
    expect(s.draft).toBeNull()
  })

  it('detail lifecycle: loading -> loaded clears loading/error', () => {
    let s = reducer(initialState, { type: 'DETAIL_LOADING', id: 'a' })
    expect(s.loadingDetail.a).toBe(true)
    s = reducer(s, { type: 'DETAIL_LOADED', id: 'a', thread: thread('a') })
    expect(s.loadingDetail.a).toBeUndefined()
    expect(s.detailById.a.id).toBe('a')
  })

  it('optimistic comment add / replace / remove', () => {
    let s = reducer(initialState, { type: 'DETAIL_LOADED', id: 'a', thread: thread('a') })
    s = reducer(s, { type: 'ADD_OPTIMISTIC_COMMENT', id: 'a', comment: comment('temp-1') })
    expect(s.detailById.a.comments.map((c) => c.id)).toEqual(['temp-1'])
    s = reducer(s, { type: 'REPLACE_OPTIMISTIC_COMMENT', id: 'a', tempId: 'temp-1', comment: comment('real-1') })
    expect(s.detailById.a.comments.map((c) => c.id)).toEqual(['real-1'])
    s = reducer(s, { type: 'ADD_OPTIMISTIC_COMMENT', id: 'a', comment: comment('temp-2') })
    s = reducer(s, { type: 'REMOVE_OPTIMISTIC_COMMENT', id: 'a', tempId: 'temp-2' })
    expect(s.detailById.a.comments.map((c) => c.id)).toEqual(['real-1'])
  })

  it('SET_STATUS updates both the list item and the detail', () => {
    let s = reducer(initialState, { type: 'INGEST_PLACEMENTS', placements: [placed('a')] })
    s = reducer(s, { type: 'DETAIL_LOADED', id: 'a', thread: thread('a') })
    s = reducer(s, { type: 'SET_STATUS', id: 'a', status: 'resolved' })
    expect(s.itemsById.a.status).toBe('resolved')
    expect(s.detailById.a.status).toBe('resolved')
  })

  it('SET_SHOW_RESOLVED toggles the flag', () => {
    const s = reducer(initialState, { type: 'SET_SHOW_RESOLVED', value: true })
    expect(s.showResolved).toBe(true)
  })
})

describe('visiblePlacements selector', () => {
  it('hides resolved by default and reveals them when showResolved', () => {
    const base = reducer(initialState, {
      type: 'INGEST_PLACEMENTS',
      placements: [placed('a', 'open'), placed('b', 'resolved')],
    })
    expect(visiblePlacements(base).map((p) => p.item.id)).toEqual(['a'])
    expect(visiblePlacements({ ...base, showResolved: true }).map((p) => p.item.id)).toEqual(['a', 'b'])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @comments/client exec vitest run src/threads/state.test.ts`
Expected: FAIL — `Failed to resolve import "./state"`.

- [ ] **Step 3: Write the implementation**

```ts
// packages/client/src/threads/state.ts
import type { Anchor, Comment, Thread, ThreadListItem, ThreadStatus } from '@comments/core'
import type { Box, XY } from '../positioning/coords'

/** A matched thread plus its on-screen geometry — what the runtime emits to the store. */
export type PlacedThread = { item: ThreadListItem; pin: XY; highlight: Box[] }

/** A just-placed thread that has no id yet (lives only here until createThread succeeds). */
export type Draft = { anchor: Anchor; point: { x: number; y: number }; pin: XY }

export type ThreadsState = {
  itemsById: Record<string, ThreadListItem>
  placementsById: Record<string, { pin: XY; highlight: Box[] }>
  order: string[]
  openId: string | null
  detailById: Record<string, Thread>
  loadingDetail: Record<string, boolean>
  detailError: Record<string, boolean>
  draft: Draft | null
  showResolved: boolean
  /** Set when an open thread orphaned out of an ingest; the view toasts + clears it. */
  lostOpenId: string | null
}

export const initialState: ThreadsState = {
  itemsById: {},
  placementsById: {},
  order: [],
  openId: null,
  detailById: {},
  loadingDetail: {},
  detailError: {},
  draft: null,
  showResolved: false,
  lostOpenId: null,
}

export type Action =
  | { type: 'INGEST_PLACEMENTS'; placements: PlacedThread[] }
  | { type: 'OPEN'; id: string }
  | { type: 'CLOSE' }
  | { type: 'SET_DRAFT'; draft: Draft }
  | { type: 'CLEAR_DRAFT' }
  | { type: 'CLEAR_LOST_OPEN' }
  | { type: 'SET_SHOW_RESOLVED'; value: boolean }
  | { type: 'DETAIL_LOADING'; id: string }
  | { type: 'DETAIL_LOADED'; id: string; thread: Thread }
  | { type: 'DETAIL_ERROR'; id: string }
  | { type: 'ADD_OPTIMISTIC_COMMENT'; id: string; comment: Comment }
  | { type: 'REPLACE_OPTIMISTIC_COMMENT'; id: string; tempId: string; comment: Comment }
  | { type: 'REMOVE_OPTIMISTIC_COMMENT'; id: string; tempId: string }
  | { type: 'SET_STATUS'; id: string; status: ThreadStatus }

function mapDetail(state: ThreadsState, id: string, fn: (t: Thread) => Thread): ThreadsState {
  const t = state.detailById[id]
  if (!t) return state
  return { ...state, detailById: { ...state.detailById, [id]: fn(t) } }
}

export function reducer(state: ThreadsState, action: Action): ThreadsState {
  switch (action.type) {
    case 'INGEST_PLACEMENTS': {
      const itemsById: Record<string, ThreadListItem> = {}
      const placementsById: Record<string, { pin: XY; highlight: Box[] }> = {}
      const order: string[] = []
      for (const p of action.placements) {
        itemsById[p.item.id] = p.item
        placementsById[p.item.id] = { pin: p.pin, highlight: p.highlight }
        order.push(p.item.id)
      }
      // Invariant: ingest must not reset openId/detail/draft. The one exception:
      // if the open thread dropped out of the set (orphaned), close it and flag the loss.
      const openGone = state.openId !== null && !(state.openId in itemsById)
      return {
        ...state,
        itemsById,
        placementsById,
        order,
        openId: openGone ? null : state.openId,
        lostOpenId: openGone ? state.openId : state.lostOpenId,
      }
    }
    case 'OPEN':
      return { ...state, openId: action.id, draft: null }
    case 'CLOSE':
      return { ...state, openId: null }
    case 'SET_DRAFT':
      return { ...state, draft: action.draft, openId: null }
    case 'CLEAR_DRAFT':
      return { ...state, draft: null }
    case 'CLEAR_LOST_OPEN':
      return { ...state, lostOpenId: null }
    case 'SET_SHOW_RESOLVED':
      return { ...state, showResolved: action.value }
    case 'DETAIL_LOADING':
      return {
        ...state,
        loadingDetail: { ...state.loadingDetail, [action.id]: true },
        detailError: { ...state.detailError, [action.id]: false },
      }
    case 'DETAIL_LOADED': {
      const { [action.id]: _l, ...loading } = state.loadingDetail
      const { [action.id]: _e, ...error } = state.detailError
      return {
        ...state,
        loadingDetail: loading,
        detailError: error,
        detailById: { ...state.detailById, [action.id]: action.thread },
      }
    }
    case 'DETAIL_ERROR': {
      const { [action.id]: _l, ...loading } = state.loadingDetail
      return {
        ...state,
        loadingDetail: loading,
        detailError: { ...state.detailError, [action.id]: true },
      }
    }
    case 'ADD_OPTIMISTIC_COMMENT':
      return mapDetail(state, action.id, (t) => ({ ...t, comments: [...t.comments, action.comment] }))
    case 'REPLACE_OPTIMISTIC_COMMENT':
      return mapDetail(state, action.id, (t) => ({
        ...t,
        comments: t.comments.map((c) => (c.id === action.tempId ? action.comment : c)),
      }))
    case 'REMOVE_OPTIMISTIC_COMMENT':
      return mapDetail(state, action.id, (t) => ({
        ...t,
        comments: t.comments.filter((c) => c.id !== action.tempId),
      }))
    case 'SET_STATUS': {
      const item = state.itemsById[action.id]
      const withItem = item
        ? { ...state, itemsById: { ...state.itemsById, [action.id]: { ...item, status: action.status } } }
        : state
      return mapDetail(withItem, action.id, (t) => ({ ...t, status: action.status }))
    }
    default:
      return state
  }
}

/** Placements to render: resolved hidden unless showResolved. Reconstructed from store maps. */
export function visiblePlacements(state: ThreadsState): PlacedThread[] {
  const out: PlacedThread[] = []
  for (const id of state.order) {
    const item = state.itemsById[id]
    const geo = state.placementsById[id]
    if (!item || !geo) continue
    if (item.status === 'resolved' && !state.showResolved) continue
    out.push({ item, pin: geo.pin, highlight: geo.highlight })
  }
  return out
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @comments/client exec vitest run src/threads/state.test.ts`
Expected: PASS (11 tests).

- [ ] **Step 5: Typecheck and commit**

```bash
pnpm --filter @comments/client exec tsc --build
git add packages/client/src/threads/state.ts packages/client/src/threads/state.test.ts
git commit -m "M7: threads store reducer + visiblePlacements selector (pure)"
```

---

## Task 3: Feed the store from the runtime (PlacedThread refactor)

M6's runtime emits `Placement[]`. M7 changes it to emit `PlacedThread[]` (geometry + the `ThreadListItem` it already fetches but currently discards). `PinLayer` switches to `PlacedThread`. This touches existing M6 tests, which we update.

**Files:**
- Modify: `packages/client/src/anchor/runtime.ts`
- Modify: `packages/client/src/positioning/layer.tsx`
- Modify (tests): `packages/client/src/anchor/runtime.test.ts`, `packages/client/src/positioning/layer.test.tsx`

- [ ] **Step 1: Update `layer.tsx` to use `PlacedThread`**

Replace the whole file. `PinLayer` keeps rendering highlight rects (still pure) and now renders **plain pin dots** keyed by `item.id` — the rich teardrop + popover arrive in later tasks; this step only re-types the data flow so M6 keeps passing.

```tsx
// packages/client/src/positioning/layer.tsx
import type { PlacedThread } from '../threads/state'

export type { PlacedThread } from '../threads/state'

export function PinLayer({ placements }: { placements: PlacedThread[] }) {
  return (
    <div data-comments-overlay className="cmnt:absolute cmnt:inset-0 cmnt:pointer-events-none">
      {placements.flatMap((p) =>
        p.highlight.map((h) => (
          <div
            key={`${p.item.id}-hl-${h.x}-${h.y}-${h.width}-${h.height}`}
            data-testid="comments-highlight"
            data-comments-highlight
            className="cmnt:absolute cmnt:bg-blue-600/20 cmnt:pointer-events-none"
            // transform + dims are computed → inline
            style={{ transform: `translate(${h.x}px, ${h.y}px)`, width: h.width, height: h.height }}
          />
        )),
      )}
      {placements.map((p) => (
        <div
          key={p.item.id}
          data-testid="comments-pin"
          data-comments-pin
          className="cmnt:absolute cmnt:w-5 cmnt:h-5 cmnt:-ml-2.5 cmnt:-mt-2.5 cmnt:rounded-full cmnt:bg-blue-600 cmnt:pointer-events-auto"
          style={{ transform: `translate(${p.pin.x}px, ${p.pin.y}px)` }}
        />
      ))}
    </div>
  )
}
```

- [ ] **Step 2: Update `runtime.ts` to retain the `ThreadListItem` and emit `PlacedThread[]`**

Change the retained record to carry `item`, change `onPlacements`'s type, and build the emitted shape from the item's anchor offset.

```ts
// packages/client/src/anchor/runtime.ts
import type { Anchor, ThreadListItem } from '@comments/core'
import type { ApiClient } from '../api/client'
import { type Box, mapRects, pinXY } from '../positioning/coords'
import type { PlacedThread } from '../threads/state'
import { rematch } from './rematch'

export type RuntimeOptions = {
  client: Pick<ApiClient, 'listThreads' | 'refreshAnchor'>
  pageKey: string
  onPlacements: (placements: PlacedThread[]) => void
  root?: ParentNode
}

type Placed = { item: ThreadListItem; el: Element; anchor: Anchor; highlight: Box[] }

function placedToPlacement(p: Placed): PlacedThread {
  const rect = p.el.getBoundingClientRect()
  return { item: p.item, pin: pinXY(rect, p.anchor.offset), highlight: p.highlight }
}

export function createRuntime(opts: RuntimeOptions) {
  const root = opts.root ?? document
  let placed: Placed[] = []

  function emit() {
    opts.onPlacements(placed.map(placedToPlacement))
  }

  // returns the retained record for a matched thread, or null if orphaned (already reported + dropped).
  // `anchor` is the fingerprint to match against: the list item's anchor on the first pass,
  // or the retained (possibly self-healed) anchor on a re-match pass.
  function matchAndReport(item: ThreadListItem, anchor: Anchor): Placed | null {
    const res = rematch(anchor, root)
    if (res.kind === 'orphaned') {
      void opts.client.refreshAnchor(item.id, { anchorState: 'orphaned' }).catch(() => {})
      return null
    }
    let nextAnchor = anchor
    if (res.healed) {
      void opts.client
        .refreshAnchor(item.id, {
          anchorState: 'anchored',
          selectors: res.healed.selectors,
          signals: res.healed.signals,
          ...(res.kind === 'selectionLost' ? { selectionLost: true } : {}),
        })
        .catch(() => {})
      nextAnchor = { ...anchor, selectors: res.healed.selectors, signals: res.healed.signals }
    } else if (res.kind === 'selectionLost') {
      void opts.client
        .refreshAnchor(item.id, { anchorState: 'anchored', selectionLost: true })
        .catch(() => {})
    }
    const highlight =
      res.kind === 'anchored' && res.range ? mapRects(Array.from(res.range.getClientRects())) : []
    return { item, el: res.el, anchor: nextAnchor, highlight }
  }

  const resizeObs = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => emit()) : null

  function observeWinners() {
    resizeObs?.disconnect()
    for (const p of placed) resizeObs?.observe(p.el)
  }

  async function refresh() {
    const { threads } = await opts.client.listThreads({ pageKey: opts.pageKey })
    placed = threads
      .map((t) => matchAndReport(t, t.anchor))
      .filter((p): p is Placed => p !== null)
    observeWinners()
    emit()
  }

  function rematchAll() {
    // Re-match from the RETAINED anchor (p.anchor), which may already be self-healed —
    // matching M6 semantics so drift isn't re-detected (and re-POSTed) every mutation frame.
    placed = placed
      .map((p) => matchAndReport(p.item, p.anchor))
      .filter((p): p is Placed => p !== null)
    observeWinners()
    emit()
  }

  function dispose() {
    resizeObs?.disconnect()
  }

  return {
    refresh,
    reposition: emit,
    rematchAll,
    dispose,
    get placed() {
      return placed
    },
  }
}
```

> This preserves M6's behavior exactly: `refresh()` matches from the list item's anchor; `rematchAll()` matches from the retained `p.anchor` (which carries any self-heal). The only change is the emitted shape (`PlacedThread` instead of `Placement`) and carrying `item` on the retained record.

- [ ] **Step 3: Update existing M6 tests to the new emit shape**

In `packages/client/src/anchor/runtime.test.ts`, the `onPlacements` callback now receives `PlacedThread[]` (`{ item, pin, highlight }`) instead of `{ id, pin, highlight, pending }`. Update assertions: replace `placement.id` with `placement.item.id`, and drop any `pending` assertions. The `listThreads` mock already returns `{ threads: [{ id, anchor, ... }], nextCursor }`; ensure each mocked thread is a full `ThreadListItem` (add `status: 'open'`, `anchorState: 'anchored'`, `unresolvedCount`, `commentCount`, `createdBy`).

In `packages/client/src/positioning/layer.test.tsx`, change the `placements` fixtures from `{ id, pin, highlight, pending }` to `{ item: { id, status:'open', anchorState:'anchored', unresolvedCount:0, commentCount:0, createdBy:{email:'a@b.c'}, anchor:{offset:{fx:.5,fy:.5}} } as unknown as ThreadListItem, pin, highlight }`, and replace `getByTestId('comments-pin')` key/text assertions accordingly (pins are keyed by `item.id`).

- [ ] **Step 4: Run the affected tests**

Run: `pnpm --filter @comments/client exec vitest run src/anchor/runtime.test.ts src/positioning/layer.test.tsx`
Expected: PASS. If a fixture is missing a required `ThreadListItem` field, TypeScript/zod-free runtime won't complain (these are cast fixtures) — fix the assertion shape until green.

- [ ] **Step 5: Typecheck, format, commit**

```bash
pnpm --filter @comments/client exec tsc --build
pnpm format
git add packages/client/src/anchor/runtime.ts packages/client/src/positioning/layer.tsx packages/client/src/anchor/runtime.test.ts packages/client/src/positioning/layer.test.tsx
git commit -m "M7: runtime emits PlacedThread (carry ThreadListItem); PinLayer re-typed"
```

---

## Task 4: ThreadsProvider + controller + hooks

Wires the reducer into React, instantiates the controller (the M8 seam), and performs the lazy `getThread` side effect on open.

**Files:**
- Create: `packages/client/src/threads/controller.ts`
- Create: `packages/client/src/threads/ThreadsProvider.tsx`
- Create: `packages/client/src/threads/useThreads.ts`
- Test: `packages/client/src/threads/ThreadsProvider.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// packages/client/src/threads/ThreadsProvider.test.tsx
import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ThreadsProvider } from './ThreadsProvider'
import { useController, useOpenThread } from './useThreads'

function Probe() {
  const controller = useController()
  const { openId, detail, loading } = useOpenThread()
  return (
    <div>
      <button type="button" onClick={() => controller.openThread('a')}>
        open
      </button>
      <span data-testid="openId">{openId ?? 'none'}</span>
      <span data-testid="loading">{loading ? 'yes' : 'no'}</span>
      <span data-testid="detail">{detail ? detail.id : 'none'}</span>
    </div>
  )
}

describe('ThreadsProvider + controller', () => {
  it('openThread sets openId and lazily fetches the thread detail', async () => {
    const getThread = vi.fn().mockResolvedValue({ id: 'a', status: 'open', comments: [] })
    render(
      <ThreadsProvider client={{ getThread } as never}>
        <Probe />
      </ThreadsProvider>,
    )
    screen.getByText('open').click()
    await waitFor(() => expect(screen.getByTestId('openId').textContent).toBe('a'))
    expect(getThread).toHaveBeenCalledWith('a')
    await waitFor(() => expect(screen.getByTestId('detail').textContent).toBe('a'))
    expect(screen.getByTestId('loading').textContent).toBe('no')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @comments/client exec vitest run src/threads/ThreadsProvider.test.tsx`
Expected: FAIL — cannot resolve `./ThreadsProvider`.

- [ ] **Step 3: Write the controller**

```ts
// packages/client/src/threads/controller.ts
import type { ApiClient } from '../api/client'
import type { Action } from './state'

export type Controller = {
  openThread(id: string): void
  close(): void
  setShowResolved(value: boolean): void
}

/**
 * The imperative surface over the store. M8 calls `openThread(id)` to focus a pin
 * after cross-page navigation; M7 uses it for pin clicks. Opening triggers the lazy
 * `getThread` fetch (fire-and-forget; the reducer tracks loading/error).
 */
export function createController(
  dispatch: (a: Action) => void,
  deps: { client: Pick<ApiClient, 'getThread'>; isCached: (id: string) => boolean },
): Controller {
  return {
    openThread(id) {
      dispatch({ type: 'OPEN', id })
      if (deps.isCached(id)) return
      dispatch({ type: 'DETAIL_LOADING', id })
      deps.client
        .getThread(id)
        .then((thread) => dispatch({ type: 'DETAIL_LOADED', id, thread }))
        .catch(() => dispatch({ type: 'DETAIL_ERROR', id }))
    },
    close() {
      dispatch({ type: 'CLOSE' })
    },
    setShowResolved(value) {
      dispatch({ type: 'SET_SHOW_RESOLVED', value })
    },
  }
}
```

- [ ] **Step 4: Write the provider**

```tsx
// packages/client/src/threads/ThreadsProvider.tsx
import { createContext, type ReactNode, useMemo, useReducer, useRef } from 'react'
import type { ApiClient } from '../api/client'
import { type Controller, createController } from './controller'
import { type Action, initialState, reducer, type ThreadsState } from './state'

export type ThreadsContextValue = {
  state: ThreadsState
  dispatch: (a: Action) => void
  controller: Controller
}

export const ThreadsContext = createContext<ThreadsContextValue | null>(null)

export function ThreadsProvider({
  client,
  children,
}: {
  client: Pick<ApiClient, 'getThread'>
  children: ReactNode
}) {
  const [state, dispatch] = useReducer(reducer, initialState)
  // Keep a live ref so the controller (created once) reads fresh cache state.
  const stateRef = useRef(state)
  stateRef.current = state

  const controller = useMemo(
    () =>
      createController(dispatch, {
        client,
        isCached: (id) => id in stateRef.current.detailById,
      }),
    [client],
  )

  const value = useMemo<ThreadsContextValue>(
    () => ({ state, dispatch, controller }),
    [state, controller],
  )
  return <ThreadsContext.Provider value={value}>{children}</ThreadsContext.Provider>
}
```

- [ ] **Step 5: Write the hooks**

```ts
// packages/client/src/threads/useThreads.ts
import { useContext } from 'react'
import type { Thread } from '@comments/core'
import { ThreadsContext } from './ThreadsProvider'
import { type PlacedThread, visiblePlacements } from './state'

function useCtx() {
  const ctx = useContext(ThreadsContext)
  if (!ctx) throw new Error('useThreads* must be used within <ThreadsProvider>')
  return ctx
}

export function useThreadsState() {
  return useCtx().state
}

export function useController() {
  return useCtx().controller
}

export function useDispatch() {
  return useCtx().dispatch
}

export function useVisiblePlacements(): PlacedThread[] {
  return visiblePlacements(useCtx().state)
}

export function useShowResolved(): boolean {
  return useCtx().state.showResolved
}

export function useOpenThread(): {
  openId: string | null
  detail: Thread | null
  loading: boolean
  error: boolean
} {
  const { state } = useCtx()
  const id = state.openId
  return {
    openId: id,
    detail: id ? (state.detailById[id] ?? null) : null,
    loading: id ? Boolean(state.loadingDetail[id]) : false,
    error: id ? Boolean(state.detailError[id]) : false,
  }
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm --filter @comments/client exec vitest run src/threads/ThreadsProvider.test.tsx`
Expected: PASS.

- [ ] **Step 7: Typecheck, format, commit**

```bash
pnpm --filter @comments/client exec tsc --build
pnpm format
git add packages/client/src/threads/controller.ts packages/client/src/threads/ThreadsProvider.tsx packages/client/src/threads/useThreads.ts packages/client/src/threads/ThreadsProvider.test.tsx
git commit -m "M7: ThreadsProvider + controller (open-by-id seam) + hooks"
```

---

## Task 5: Presentational pin (teardrop + avatar) and avatar helpers

**Files:**
- Create: `packages/client/src/ui/avatar.ts`
- Create: `packages/client/src/ui/Pin.tsx`
- Test: `packages/client/src/ui/avatar.test.ts`
- Test: `packages/client/src/ui/Pin.test.tsx`

- [ ] **Step 1: Write the failing avatar test**

```ts
// packages/client/src/ui/avatar.test.ts
import type { Author } from '@comments/core'
import { describe, expect, it } from 'vitest'
import { avatarColor, initials } from './avatar'

const a = (email: string, name?: string) => ({ email, name }) as Author

describe('initials', () => {
  it('uses two name parts', () => expect(initials(a('x@y.z', 'Ada Lovelace'))).toBe('AL'))
  it('uses one name part', () => expect(initials(a('x@y.z', 'Ada'))).toBe('A'))
  it('falls back to the email local part', () => expect(initials(a('ada@y.z'))).toBe('AD'))
})

describe('avatarColor', () => {
  it('is deterministic for the same seed', () =>
    expect(avatarColor('a@b.c')).toBe(avatarColor('a@b.c')))
  it('returns an hsl string', () => expect(avatarColor('a@b.c')).toMatch(/^hsl\(/))
})
```

- [ ] **Step 2: Run it (fails), then implement avatar helpers**

Run: `pnpm --filter @comments/client exec vitest run src/ui/avatar.test.ts` → FAIL.

```ts
// packages/client/src/ui/avatar.ts
import type { Author } from '@comments/core'

export function initials(author: Author): string {
  const name = author.name?.trim()
  if (name) {
    const parts = name.split(/\s+/)
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    return parts[0].slice(0, 1).toUpperCase()
  }
  return (author.email.split('@')[0] || '?').slice(0, 2).toUpperCase()
}

export function avatarColor(seed: string): string {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % 360
  return `hsl(${h}, 55%, 45%)`
}
```

Run again → PASS (5 tests).

- [ ] **Step 3: Write the failing Pin test**

```tsx
// packages/client/src/ui/Pin.test.tsx
import type { ThreadListItem } from '@comments/core'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Pin } from './Pin'

const item = (over: Partial<ThreadListItem> = {}) =>
  ({
    id: 'a',
    status: 'open',
    anchorState: 'anchored',
    unresolvedCount: 3,
    commentCount: 3,
    createdBy: { email: 'a@b.c', name: 'Ann Lee' },
    ...over,
  }) as unknown as ThreadListItem

describe('Pin', () => {
  it('renders initials, an unresolved count, and an aria-label; click fires onOpen', () => {
    const onOpen = vi.fn()
    render(<Pin item={item()} pin={{ x: 5, y: 6 }} onOpen={onOpen} />)
    const btn = screen.getByRole('button', { name: /Ann Lee/i })
    expect(btn).toHaveTextContent('AL')
    expect(btn).toHaveTextContent('3')
    fireEvent.click(btn)
    expect(onOpen).toHaveBeenCalled()
  })

  it('resolved pins show a check, not a count, and label as resolved', () => {
    render(<Pin item={item({ status: 'resolved', unresolvedCount: 0 })} pin={{ x: 0, y: 0 }} onOpen={() => {}} />)
    const btn = screen.getByRole('button', { name: /resolved/i })
    expect(btn).toHaveTextContent('✓')
  })
})
```

- [ ] **Step 4: Run it (fails), then implement `Pin`**

Run: `pnpm --filter @comments/client exec vitest run src/ui/Pin.test.tsx` → FAIL.

```tsx
// packages/client/src/ui/Pin.tsx
import type { ThreadListItem } from '@comments/core'
import { forwardRef } from 'react'
import { cn } from '../lib/cn'
import type { XY } from '../positioning/coords'
import { initials } from './avatar'

export type PinProps = {
  item: ThreadListItem
  pin: XY
  onOpen: () => void
}

/** The teardrop pin: solid-blue avatar, white ring, dark count pill. Resolved → grey + check. */
export const Pin = forwardRef<HTMLButtonElement, PinProps>(function Pin({ item, pin, onOpen }, ref) {
  const resolved = item.status === 'resolved'
  const label = resolved
    ? `Resolved comment thread by ${item.createdBy.name ?? item.createdBy.email}`
    : `Comment thread by ${item.createdBy.name ?? item.createdBy.email}, ${item.unresolvedCount} unresolved`
  return (
    <button
      ref={ref}
      type="button"
      data-comments-pin
      data-comments-pin-id={item.id}
      data-testid="comments-pin"
      aria-label={label}
      onClick={onOpen}
      // tip of the teardrop points at the anchor (-mt-[42px]); transform is computed → inline
      className="cmnt:absolute cmnt:w-[42px] cmnt:h-[42px] cmnt:-ml-[21px] cmnt:-mt-[42px] cmnt:p-0 cmnt:border-none cmnt:bg-transparent cmnt:cursor-pointer cmnt:pointer-events-auto"
      style={{ transform: `translate(${pin.x}px, ${pin.y}px)` }}
    >
      <span
        aria-hidden
        className={cn(
          'cmnt:absolute cmnt:inset-0 cmnt:border-2 cmnt:border-white cmnt:shadow-lg',
          resolved ? 'cmnt:bg-gray-400' : 'cmnt:bg-blue-600',
        )}
        // one-off teardrop shape (no utility) → inline
        style={{ borderRadius: '50% 50% 50% 0', transform: 'rotate(-45deg)' }}
      />
      <span
        aria-hidden
        className={cn(
          'cmnt:absolute cmnt:top-1.5 cmnt:left-1.5 cmnt:w-[30px] cmnt:h-[30px] cmnt:rounded-full cmnt:border-2 cmnt:border-white cmnt:flex cmnt:items-center cmnt:justify-center cmnt:font-semibold',
          resolved ? 'cmnt:bg-white cmnt:text-green-600 cmnt:text-base' : 'cmnt:bg-blue-600 cmnt:text-white cmnt:text-xs',
        )}
      >
        {resolved ? '✓' : initials(item.createdBy)}
      </span>
      {!resolved && item.unresolvedCount > 0 && (
        <span
          aria-hidden
          className="cmnt:absolute cmnt:-top-1.5 cmnt:-right-[7px] cmnt:min-w-[18px] cmnt:h-[18px] cmnt:rounded-[9px] cmnt:bg-gray-900 cmnt:text-white cmnt:text-[11px] cmnt:font-bold cmnt:flex cmnt:items-center cmnt:justify-center cmnt:px-[5px] cmnt:border-2 cmnt:border-white"
        >
          {item.unresolvedCount}
        </span>
      )}
    </button>
  )
})
```

Run again → PASS (2 tests).

- [ ] **Step 5: Typecheck, format, commit**

```bash
pnpm --filter @comments/client exec tsc --build
pnpm format
git add packages/client/src/ui/avatar.ts packages/client/src/ui/avatar.test.ts packages/client/src/ui/Pin.tsx packages/client/src/ui/Pin.test.tsx
git commit -m "M7: teardrop Pin + avatar initials/color helpers"
```

---

## Task 6: Add Radix Popover dependency

**Files:**
- Modify: `packages/client/package.json`

- [ ] **Step 1: Add the dependency**

Add to `dependencies` in `packages/client/package.json` (alongside `@radix-ui/react-dialog`):

```json
    "@radix-ui/react-popover": "^1.1.6",
```

- [ ] **Step 2: Install**

Run: `pnpm install`
Expected: lockfile updates; `@radix-ui/react-popover` resolves.

- [ ] **Step 3: Verify it imports**

Run: `pnpm --filter @comments/client exec node -e "import('@radix-ui/react-popover').then(m=>console.log(typeof m.Root))"`
Expected: prints `object` or `function` (module resolves).

- [ ] **Step 4: Commit**

```bash
git add packages/client/package.json pnpm-lock.yaml
git commit -m "M7: add @radix-ui/react-popover dependency"
```

---

## Task 7: CommentList (render comments, skeleton, empty)

**Files:**
- Create: `packages/client/src/ui/CommentList.tsx`
- Test: `packages/client/src/ui/CommentList.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// packages/client/src/ui/CommentList.test.tsx
import type { Comment } from '@comments/core'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { CommentList } from './CommentList'

const comment = (over: Partial<Comment> = {}): Comment =>
  ({
    id: 'c1',
    author: { email: 'a@b.c', name: 'Ann' },
    text: 'Sentence case please.',
    attachments: [],
    createdAt: new Date().toISOString(),
    ...over,
  }) as unknown as Comment

describe('CommentList', () => {
  it('renders a skeleton while loading', () => {
    render(<CommentList comments={[]} loading error={false} />)
    expect(screen.getByTestId('comments-skeleton')).toBeInTheDocument()
  })
  it('renders the empty state when there are no comments and not loading', () => {
    render(<CommentList comments={[]} loading={false} error={false} />)
    expect(screen.getByText(/start the thread/i)).toBeInTheDocument()
  })
  it('renders comments with author, text, and an image attachment', () => {
    render(
      <CommentList
        loading={false}
        error={false}
        comments={[
          comment({
            attachments: [
              { id: 'at1', url: 'https://x/y.png', name: 'shot.png', contentType: 'image/png', size: 1 } as never,
            ],
          }),
        ]}
      />,
    )
    expect(screen.getByText('Ann')).toBeInTheDocument()
    expect(screen.getByText('Sentence case please.')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'shot.png' })).toHaveAttribute('src', 'https://x/y.png')
  })
  it('renders an inline retry on error', () => {
    render(<CommentList comments={[]} loading={false} error onRetry={() => {}} />)
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run it (fails), then implement**

Run: `pnpm --filter @comments/client exec vitest run src/ui/CommentList.test.tsx` → FAIL.

```tsx
// packages/client/src/ui/CommentList.tsx
import type { Comment } from '@comments/core'
import { relativeTime } from '../threads/relativeTime'
import { avatarColor, initials } from './avatar'

export type CommentListProps = {
  comments: Comment[]
  loading: boolean
  error: boolean
  onRetry?: () => void
}

const LINK = 'cmnt:bg-transparent cmnt:border-none cmnt:text-blue-600 cmnt:cursor-pointer cmnt:p-0 cmnt:underline'

export function CommentList({ comments, loading, error, onRetry }: CommentListProps) {
  if (error) {
    return (
      <div className="cmnt:p-3 cmnt:text-[13px] cmnt:text-gray-500">
        Couldn’t load this thread.{' '}
        <button type="button" onClick={onRetry} className={LINK}>
          Retry
        </button>
      </div>
    )
  }
  if (loading) {
    return (
      <div data-testid="comments-skeleton" className="cmnt:p-3">
        {[0, 1].map((i) => (
          <div key={i} className="cmnt:flex cmnt:gap-[9px] cmnt:mb-3.5">
            <div className="cmnt:w-[26px] cmnt:h-[26px] cmnt:rounded-full cmnt:bg-gray-200" />
            <div className="cmnt:flex-1">
              <div className="cmnt:w-2/5 cmnt:h-2.5 cmnt:bg-gray-200 cmnt:rounded" />
              <div className="cmnt:w-[85%] cmnt:h-2.5 cmnt:bg-gray-100 cmnt:rounded cmnt:mt-1.5" />
            </div>
          </div>
        ))}
      </div>
    )
  }
  if (comments.length === 0) {
    return (
      <div className="cmnt:px-3 cmnt:py-4 cmnt:text-gray-400 cmnt:text-center cmnt:text-[13px]">
        💬 No comments yet — start the thread.
      </div>
    )
  }
  return (
    <div className="cmnt:max-h-[230px] cmnt:overflow-auto cmnt:p-3">
      {comments.map((c) => (
        <div key={c.id} className="cmnt:flex cmnt:gap-[9px] cmnt:mb-3.5">
          <div
            aria-hidden
            className="cmnt:shrink-0 cmnt:w-[26px] cmnt:h-[26px] cmnt:rounded-full cmnt:text-white cmnt:flex cmnt:items-center cmnt:justify-center cmnt:text-[11px] cmnt:font-semibold"
            style={{ backgroundColor: avatarColor(c.author.email) }} // per-author color is computed → inline
          >
            {initials(c.author)}
          </div>
          <div className="cmnt:min-w-0">
            <div className="cmnt:flex cmnt:gap-1.5 cmnt:items-baseline">
              <b className="cmnt:text-xs">{c.author.name ?? c.author.email}</b>
              <span className="cmnt:text-gray-400 cmnt:text-[11px]">{relativeTime(c.createdAt)}</span>
            </div>
            <div className="cmnt:mt-0.5 cmnt:leading-relaxed cmnt:text-[13px] cmnt:whitespace-pre-wrap">
              {c.text}
            </div>
            {c.attachments.map((a) => (
              <img
                key={a.id}
                src={a.url}
                alt={a.name}
                className="cmnt:mt-1.5 cmnt:max-w-[160px] cmnt:rounded-lg cmnt:border cmnt:border-slate-300 cmnt:block"
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
```

Run again → PASS (4 tests).

- [ ] **Step 3: Typecheck, format, commit**

```bash
pnpm --filter @comments/client exec tsc --build
pnpm format
git add packages/client/src/ui/CommentList.tsx packages/client/src/ui/CommentList.test.tsx
git commit -m "M7: CommentList — comments, attachments, skeleton, empty, error"
```

---

## Task 8: Attachment thumbnail (pending / error) + upload hook

A small unit for the composer's pending-attachment chip. The upload orchestration lives in the composer (Task 9); this is the presentational chip plus a tiny `useUpload` hook so the composer stays readable.

**Files:**
- Create: `packages/client/src/ui/Attachment.tsx`
- Test: `packages/client/src/ui/Attachment.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// packages/client/src/ui/Attachment.test.tsx
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { PendingAttachment } from './Attachment'

describe('PendingAttachment', () => {
  it('shows a spinner while uploading and a remove button', () => {
    const onRemove = vi.fn()
    render(<PendingAttachment name="shot.png" status="uploading" onRemove={onRemove} onRetry={() => {}} />)
    expect(screen.getByTestId('attachment-spinner')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /remove/i }))
    expect(onRemove).toHaveBeenCalled()
  })
  it('shows a retry on error', () => {
    const onRetry = vi.fn()
    render(<PendingAttachment name="shot.png" status="error" onRemove={() => {}} onRetry={onRetry} />)
    fireEvent.click(screen.getByRole('button', { name: /retry/i }))
    expect(onRetry).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run it (fails), then implement**

Run: `pnpm --filter @comments/client exec vitest run src/ui/Attachment.test.tsx` → FAIL.

```tsx
// packages/client/src/ui/Attachment.tsx

export type PendingStatus = 'uploading' | 'ready' | 'error'

export function PendingAttachment({
  name,
  status,
  previewUrl,
  onRemove,
  onRetry,
}: {
  name: string
  status: PendingStatus
  previewUrl?: string
  onRemove: () => void
  onRetry: () => void
}) {
  return (
    <div className="cmnt:relative cmnt:w-[88px] cmnt:h-[58px] cmnt:rounded-lg cmnt:overflow-hidden cmnt:border cmnt:border-slate-300 cmnt:bg-[#dbe3f0] cmnt:flex cmnt:items-center cmnt:justify-center cmnt:mb-2">
      {previewUrl ? (
        <img src={previewUrl} alt={name} className="cmnt:w-full cmnt:h-full cmnt:object-cover" />
      ) : (
        <span className="cmnt:text-slate-500 cmnt:text-[11px] cmnt:p-1 cmnt:text-center">{name}</span>
      )}
      {status === 'uploading' && (
        <div
          data-testid="attachment-spinner"
          className="cmnt:absolute cmnt:inset-0 cmnt:bg-white/55 cmnt:flex cmnt:items-center cmnt:justify-center"
        >
          <span className="cmnt:w-5 cmnt:h-5 cmnt:border-2 cmnt:border-blue-600 cmnt:border-t-transparent cmnt:rounded-full cmnt:animate-spin" />
        </div>
      )}
      {status === 'error' && (
        <button
          type="button"
          aria-label="Retry upload"
          onClick={onRetry}
          className="cmnt:absolute cmnt:inset-0 cmnt:bg-red-500/15 cmnt:border-none cmnt:text-red-700 cmnt:text-[11px] cmnt:cursor-pointer"
        >
          Retry
        </button>
      )}
      <button
        type="button"
        aria-label="Remove attachment"
        onClick={onRemove}
        className="cmnt:absolute cmnt:top-0.5 cmnt:right-0.5 cmnt:w-4 cmnt:h-4 cmnt:rounded-full cmnt:bg-gray-900 cmnt:text-white cmnt:text-[10px] cmnt:border-none cmnt:cursor-pointer cmnt:flex cmnt:items-center cmnt:justify-center"
      >
        ✕
      </button>
    </div>
  )
}
```

> The spinner uses Tailwind's built-in `cmnt:animate-spin` — no custom keyframes needed. In jsdom the animation simply doesn't run; the test asserts the spinner element exists.

Run again → PASS (2 tests).

- [ ] **Step 3: Typecheck, format, commit**

```bash
pnpm --filter @comments/client exec tsc --build
pnpm format
git add packages/client/src/ui/Attachment.tsx packages/client/src/ui/Attachment.test.tsx
git commit -m "M7: PendingAttachment chip (uploading/error/remove)"
```

---

## Task 9: Composer (new-thread + reply, identity gate, upload, optimistic)

The composer is shared by the new-thread and reply flows. It owns: text input (grows), attach→upload→hold `attachmentId`, Send gated on empty/in-flight upload, and routing every authored Send through the identity gate.

**Files:**
- Create: `packages/client/src/ui/Composer.tsx`
- Test: `packages/client/src/ui/Composer.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// packages/client/src/ui/Composer.test.tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Composer } from './Composer'

const identity = { email: 'a@b.c', name: 'Ann' }

describe('Composer', () => {
  it('disables Send when empty and enables it with text', () => {
    render(<Composer mode="reply" identity={identity} onNeedIdentity={(r) => r(identity)} onSubmit={vi.fn()} upload={vi.fn()} />)
    const send = screen.getByRole('button', { name: /send/i })
    expect(send).toBeDisabled()
    fireEvent.change(screen.getByPlaceholderText(/reply/i), { target: { value: 'hi' } })
    expect(send).toBeEnabled()
  })

  it('submits text + attachmentIds', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    render(<Composer mode="reply" identity={identity} onNeedIdentity={(r) => r(identity)} onSubmit={onSubmit} upload={vi.fn()} />)
    fireEvent.change(screen.getByPlaceholderText(/reply/i), { target: { value: 'looks good' } })
    fireEvent.click(screen.getByRole('button', { name: /send/i }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ text: 'looks good', attachmentIds: [], who: identity }))
  })

  it('prompts for identity when none is set, then resumes the send', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    const onNeedIdentity = vi.fn((resume: (i: typeof identity) => void) => resume(identity))
    render(<Composer mode="newThread" identity={null} onNeedIdentity={onNeedIdentity} onSubmit={onSubmit} upload={vi.fn()} />)
    fireEvent.change(screen.getByPlaceholderText(/add a comment/i), { target: { value: 'first' } })
    fireEvent.click(screen.getByRole('button', { name: /send/i }))
    await waitFor(() => expect(onNeedIdentity).toHaveBeenCalled())
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ text: 'first', attachmentIds: [], who: identity }))
  })

  it('uploads an attached file and gates Send until the upload resolves', async () => {
    let resolveUpload: (a: { id: string }) => void = () => {}
    const upload = vi.fn(() => new Promise((res) => { resolveUpload = res as never }))
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    render(<Composer mode="reply" identity={identity} onNeedIdentity={(r) => r(identity)} onSubmit={onSubmit} upload={upload as never} />)
    fireEvent.change(screen.getByPlaceholderText(/reply/i), { target: { value: 'see shot' } })
    const file = new File(['x'], 'shot.png', { type: 'image/png' })
    fireEvent.change(screen.getByTestId('composer-file'), { target: { files: [file] } })
    expect(screen.getByRole('button', { name: /send/i })).toBeDisabled() // upload in flight
    resolveUpload({ id: 'at1' })
    await waitFor(() => expect(screen.getByRole('button', { name: /send/i })).toBeEnabled())
    fireEvent.click(screen.getByRole('button', { name: /send/i }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ text: 'see shot', attachmentIds: ['at1'], who: identity }))
  })
})
```

- [ ] **Step 2: Run it (fails), then implement**

Run: `pnpm --filter @comments/client exec vitest run src/ui/Composer.test.tsx` → FAIL.

```tsx
// packages/client/src/ui/Composer.tsx
import type { Attachment } from '@comments/core'
import { type ChangeEvent, useRef, useState } from 'react'
import type { Identity } from '../identity/storage'
import { cn } from '../lib/cn'
import { PendingAttachment, type PendingStatus } from './Attachment'

export type ComposerSubmit = { text: string; attachmentIds: string[]; who: Identity }

export type ComposerProps = {
  mode: 'newThread' | 'reply'
  identity: Identity | null
  onNeedIdentity: (resume: (who: Identity) => void) => void
  onSubmit: (payload: ComposerSubmit) => Promise<void>
  upload: (file: File) => Promise<Attachment>
}

type Pending = { name: string; status: PendingStatus; id?: string; file: File }

export function Composer({ mode, identity, onNeedIdentity, onSubmit, upload }: ComposerProps) {
  const [text, setText] = useState('')
  const [pending, setPending] = useState<Pending | null>(null)
  const [sending, setSending] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const uploadInFlight = pending?.status === 'uploading'
  const canSend = text.trim().length > 0 && !uploadInFlight && !sending

  function startUpload(file: File) {
    setPending({ name: file.name, status: 'uploading', file })
    upload(file)
      .then((att) => setPending((p) => (p && p.file === file ? { ...p, status: 'ready', id: att.id } : p)))
      .catch(() => setPending((p) => (p && p.file === file ? { ...p, status: 'error' } : p)))
  }

  function onPick(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-selecting the same file
    if (file) startUpload(file)
  }

  function doSend(who: Identity) {
    const attachmentIds = pending?.id ? [pending.id] : []
    setSending(true)
    onSubmit({ text: text.trim(), attachmentIds, who })
      .then(() => {
        setText('')
        setPending(null)
      })
      .finally(() => setSending(false))
  }

  function onSendClick() {
    if (!canSend) return
    if (identity) doSend(identity)
    else onNeedIdentity((who) => doSend(who))
  }

  const placeholder = mode === 'newThread' ? 'Add a comment…' : 'Reply…'

  return (
    <div className="cmnt:border-t cmnt:border-[#f1f3f5] cmnt:px-3 cmnt:py-[9px]">
      {pending && (
        <PendingAttachment
          name={pending.name}
          status={pending.status}
          onRemove={() => setPending(null)}
          onRetry={() => startUpload(pending.file)}
        />
      )}
      <div className="cmnt:flex cmnt:items-center cmnt:gap-2">
        <button
          type="button"
          aria-label="Attach image"
          onClick={() => fileRef.current?.click()}
          className="cmnt:bg-transparent cmnt:border-none cmnt:cursor-pointer cmnt:text-base cmnt:text-gray-400"
        >
          📎
        </button>
        <input
          ref={fileRef}
          data-testid="composer-file"
          type="file"
          accept="image/*"
          onChange={onPick}
          className="cmnt:hidden"
        />
        <input
          aria-label={placeholder}
          placeholder={placeholder}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              onSendClick()
            }
          }}
          className="cmnt:flex-1 cmnt:border-none cmnt:outline-none cmnt:text-[13px] cmnt:bg-transparent"
        />
        <button
          type="button"
          onClick={onSendClick}
          disabled={!canSend}
          className={cn(
            'cmnt:text-white cmnt:rounded-md cmnt:px-[11px] cmnt:py-[5px] cmnt:text-xs cmnt:font-semibold cmnt:border-none',
            canSend ? 'cmnt:bg-blue-600 cmnt:cursor-pointer' : 'cmnt:bg-[#93b4f5] cmnt:cursor-default',
          )}
        >
          Send
        </button>
      </div>
    </div>
  )
}
```

Run again → PASS (4 tests).

- [ ] **Step 3: Typecheck, format, commit**

```bash
pnpm --filter @comments/client exec tsc --build
pnpm format
git add packages/client/src/ui/Composer.tsx packages/client/src/ui/Composer.test.tsx
git commit -m "M7: Composer — text + upload-gated Send + identity-gated submit"
```

---

## Task 10: ThreadPopover (Radix popover, header, resolve/reopen, reply wiring)

Ties the store to the UI for an existing thread: a controlled Radix `Popover` anchored to the pin, the quiet header with resolve/reopen, `CommentList` fed from `detailById`, and `Composer` in reply mode wired to `addComment` (+ reply-reopens) with optimistic apply/rollback.

**Files:**
- Create: `packages/client/src/ui/ThreadPopover.tsx`
- Test: `packages/client/src/ui/ThreadPopover.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// packages/client/src/ui/ThreadPopover.test.tsx
import type { ThreadListItem } from '@comments/core'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ThreadsProvider } from '../threads/ThreadsProvider'
import { useController } from '../threads/useThreads'
import { ThreadPopover } from './ThreadPopover'

const item = (over: Partial<ThreadListItem> = {}) =>
  ({
    id: 'a',
    status: 'open',
    anchorState: 'anchored',
    unresolvedCount: 1,
    commentCount: 1,
    createdBy: { email: 'a@b.c', name: 'Ann' },
    ...over,
  }) as unknown as ThreadListItem

function Harness({ client }: { client: never }) {
  const controller = useController()
  return (
    <>
      <button type="button" onClick={() => controller.openThread('a')}>
        open-a
      </button>
      <ThreadPopover
        item={item()}
        pin={{ x: 10, y: 10 }}
        client={client}
        identity={{ email: 'a@b.c', name: 'Ann' }}
        onNeedIdentity={(r) => r({ email: 'a@b.c', name: 'Ann' })}
      />
    </>
  )
}

function client(over: Record<string, unknown> = {}) {
  return {
    getThread: vi.fn().mockResolvedValue({ id: 'a', status: 'open', comments: [
      { id: 'c1', author: { email: 'a@b.c', name: 'Ann' }, text: 'first', attachments: [], createdAt: new Date().toISOString() },
    ] }),
    addComment: vi.fn().mockResolvedValue({ id: 'c2', author: { email: 'a@b.c' }, text: 'reply', attachments: [], createdAt: new Date().toISOString() }),
    setThreadStatus: vi.fn().mockResolvedValue({ id: 'a', status: 'resolved' }),
    upload: vi.fn(),
    ...over,
  } as never
}

describe('ThreadPopover', () => {
  it('opens on controller.openThread, loads detail, and shows comments', async () => {
    const c = client()
    render(<ThreadsProvider client={c}><Harness client={c} /></ThreadsProvider>)
    fireEvent.click(screen.getByText('open-a'))
    await waitFor(() => expect(screen.getByText('first')).toBeInTheDocument())
  })

  it('posts a reply via addComment (optimistic)', async () => {
    const c = client()
    render(<ThreadsProvider client={c}><Harness client={c} /></ThreadsProvider>)
    fireEvent.click(screen.getByText('open-a'))
    await waitFor(() => expect(screen.getByText('first')).toBeInTheDocument())
    fireEvent.change(screen.getByPlaceholderText(/reply/i), { target: { value: 'looks good' } })
    fireEvent.click(screen.getByRole('button', { name: /send/i }))
    await waitFor(() => expect((c as never as { addComment: ReturnType<typeof vi.fn> }).addComment).toHaveBeenCalled())
  })

  it('resolves via setThreadStatus', async () => {
    const c = client()
    render(<ThreadsProvider client={c}><Harness client={c} /></ThreadsProvider>)
    fireEvent.click(screen.getByText('open-a'))
    await waitFor(() => expect(screen.getByText('first')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /resolve/i }))
    await waitFor(() => expect((c as never as { setThreadStatus: ReturnType<typeof vi.fn> }).setThreadStatus).toHaveBeenCalledWith('a', { status: 'resolved' }))
  })
})
```

- [ ] **Step 2: Run it (fails), then implement**

Run: `pnpm --filter @comments/client exec vitest run src/ui/ThreadPopover.test.tsx` → FAIL.

```tsx
// packages/client/src/ui/ThreadPopover.tsx
import * as Popover from '@radix-ui/react-popover'
import type { Comment, ThreadListItem } from '@comments/core'
import { useRef } from 'react'
import { usePortalContainer } from '../app/providers'
import type { ApiClient } from '../api/client'
import type { Identity } from '../identity/storage'
import { cn } from '../lib/cn'
import type { XY } from '../positioning/coords'
import { useController, useDispatch, useOpenThread } from '../threads/useThreads'
import { useToast } from './toast'
import { CommentList } from './CommentList'
import { Composer, type ComposerSubmit } from './Composer'
import { Pin } from './Pin'

let nextTempId = 0

export type ThreadPopoverProps = {
  item: ThreadListItem
  pin: XY
  client: Pick<ApiClient, 'getThread' | 'addComment' | 'setThreadStatus' | 'upload'>
  identity: Identity | null
  onNeedIdentity: (resume: (who: Identity) => void) => void
}

export function ThreadPopover({ item, pin, client, identity, onNeedIdentity }: ThreadPopoverProps) {
  const id = item.id
  const controller = useController()
  const dispatch = useDispatch()
  const { openId, detail, loading, error } = useOpenThread()
  const container = usePortalContainer()
  const toast = useToast()
  const pinRef = useRef<HTMLButtonElement>(null)
  const open = openId === id
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
    if (wasResolved) dispatch({ type: 'SET_STATUS', id, status: 'open' }) // reply reopens
    try {
      const saved = await client.addComment(id, { text, attachmentIds, author: { email: who.email, name: who.name } })
      dispatch({ type: 'REPLACE_OPTIMISTIC_COMMENT', id, tempId, comment: saved })
      if (wasResolved) await client.setThreadStatus(id, { status: 'open' })
    } catch {
      dispatch({ type: 'REMOVE_OPTIMISTIC_COMMENT', id, tempId })
      if (wasResolved) dispatch({ type: 'SET_STATUS', id, status: 'resolved' })
      toast('Failed to post reply')
    }
  }

  async function toggleStatus() {
    const next = resolved ? 'open' : 'resolved'
    dispatch({ type: 'SET_STATUS', id, status: next })
    try {
      await client.setThreadStatus(id, { status: next })
    } catch {
      dispatch({ type: 'SET_STATUS', id, status: resolved ? 'resolved' : 'open' })
      toast(`Failed to ${next === 'resolved' ? 'resolve' : 'reopen'} thread`)
    }
  }

  return (
    <Popover.Root open={open} onOpenChange={(o) => (o ? controller.openThread(id) : controller.close())}>
      <Popover.Trigger asChild>
        <Pin ref={pinRef} item={item} pin={pin} onOpen={() => controller.openThread(id)} />
      </Popover.Trigger>
      <Popover.Portal container={container ?? undefined}>
        <Popover.Content
          side="top"
          align="center"
          sideOffset={8}
          className="cmnt:w-80 cmnt:bg-white cmnt:border cmnt:border-gray-200 cmnt:rounded-xl cmnt:overflow-hidden cmnt:text-[13px] cmnt:text-gray-900 cmnt:pointer-events-auto cmnt:shadow-[0_12px_32px_rgba(0,0,0,0.18)]"
        >
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
              {resolved ? '✓ Resolved' : `Open · ${item.unresolvedCount} unresolved`}
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
              <Popover.Close
                aria-label="Close"
                className="cmnt:border-none cmnt:bg-transparent cmnt:cursor-pointer cmnt:px-1.5 cmnt:py-0.5"
              >
                ✕
              </Popover.Close>
            </div>
          </div>
          <CommentList
            comments={detail?.comments ?? []}
            loading={loading}
            error={error}
            onRetry={() => controller.openThread(id)}
          />
          <Composer
            mode="reply"
            identity={identity}
            onNeedIdentity={onNeedIdentity}
            onSubmit={submitReply}
            upload={client.upload}
          />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
```

> If a Radix Popover positioning warning appears in jsdom, it is harmless — content still mounts when `open`. The tests assert on content, not coordinates.

Run again → PASS (3 tests).

- [ ] **Step 3: Typecheck, format, commit**

```bash
pnpm --filter @comments/client exec tsc --build
pnpm format
git add packages/client/src/ui/ThreadPopover.tsx packages/client/src/ui/ThreadPopover.test.tsx
git commit -m "M7: ThreadPopover — Radix popover, resolve/reopen, optimistic reply"
```

---

## Task 11: Launcher (place-mode toggle + show-resolved switch)

**Files:**
- Create: `packages/client/src/ui/Launcher.tsx`
- Test: `packages/client/src/ui/Launcher.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// packages/client/src/ui/Launcher.test.tsx
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Launcher } from './Launcher'

describe('Launcher', () => {
  it('toggles place mode and reflects the active label', () => {
    const onTogglePlace = vi.fn()
    const { rerender } = render(
      <Launcher placing={false} onTogglePlace={onTogglePlace} showResolved={false} onShowResolved={() => {}} openCount={2} />,
    )
    fireEvent.click(screen.getByTestId('comments-place'))
    expect(onTogglePlace).toHaveBeenCalled()
    rerender(<Launcher placing onTogglePlace={onTogglePlace} showResolved={false} onShowResolved={() => {}} openCount={2} />)
    expect(screen.getByTestId('comments-place')).toHaveTextContent(/click/i)
  })

  it('toggles show-resolved via a labelled switch', () => {
    const onShowResolved = vi.fn()
    render(<Launcher placing={false} onTogglePlace={() => {}} showResolved={false} onShowResolved={onShowResolved} openCount={0} />)
    fireEvent.click(screen.getByRole('switch', { name: /resolved/i }))
    expect(onShowResolved).toHaveBeenCalledWith(true)
  })
})
```

- [ ] **Step 2: Run it (fails), then implement**

Run: `pnpm --filter @comments/client exec vitest run src/ui/Launcher.test.tsx` → FAIL.

```tsx
// packages/client/src/ui/Launcher.tsx
import { cn } from '../lib/cn'

export type LauncherProps = {
  placing: boolean
  onTogglePlace: () => void
  showResolved: boolean
  onShowResolved: (value: boolean) => void
  openCount: number
}

export function Launcher({ placing, onTogglePlace, showResolved, onShowResolved, openCount }: LauncherProps) {
  return (
    <div className="cmnt:fixed cmnt:bottom-4 cmnt:right-4 cmnt:flex cmnt:items-center cmnt:gap-2 cmnt:bg-white cmnt:border cmnt:border-gray-200 cmnt:rounded-full cmnt:py-1.5 cmnt:pl-3 cmnt:pr-2 cmnt:pointer-events-auto cmnt:shadow-[0_6px_20px_rgba(0,0,0,0.18)]">
      <button
        type="button"
        role="switch"
        aria-checked={showResolved}
        aria-label="Show resolved threads"
        onClick={() => onShowResolved(!showResolved)}
        className="cmnt:inline-flex cmnt:items-center cmnt:gap-1.5 cmnt:bg-transparent cmnt:border-none cmnt:cursor-pointer cmnt:text-xs cmnt:text-gray-500"
      >
        <span
          aria-hidden
          className={cn(
            'cmnt:w-7 cmnt:h-4 cmnt:rounded-full cmnt:relative cmnt:transition-colors',
            showResolved ? 'cmnt:bg-blue-600' : 'cmnt:bg-gray-300',
          )}
        >
          <span
            className={cn(
              'cmnt:absolute cmnt:top-0.5 cmnt:w-3 cmnt:h-3 cmnt:rounded-full cmnt:bg-white cmnt:transition-all',
              showResolved ? 'cmnt:left-[14px]' : 'cmnt:left-0.5',
            )}
          />
        </span>
        Resolved
      </button>
      <button
        type="button"
        data-comments-place
        data-testid="comments-place"
        onClick={onTogglePlace}
        className={cn(
          'cmnt:rounded-full cmnt:px-3.5 cmnt:py-2 cmnt:text-white cmnt:border-none cmnt:cursor-pointer cmnt:text-[13px] cmnt:font-semibold',
          placing ? 'cmnt:bg-blue-800' : 'cmnt:bg-blue-600',
        )}
      >
        {placing ? 'Click to comment…' : `+ Comment${openCount ? ` (${openCount})` : ''}`}
      </button>
    </div>
  )
}
```

Run again → PASS (2 tests).

- [ ] **Step 3: Typecheck, format, commit**

```bash
pnpm --filter @comments/client exec tsc --build
pnpm format
git add packages/client/src/ui/Launcher.tsx packages/client/src/ui/Launcher.test.tsx
git commit -m "M7: Launcher — place-mode toggle + show-resolved switch"
```

---

## Task 12: Rewire MarkerLayer (draft lifecycle, store, popovers) and WidgetApp

This is the integration task. `MarkerLayer` keeps M6's place-mode capture but: feeds the runtime into the store, renders `Launcher` + highlights + a `ThreadPopover` per visible placement + the draft popover, and toasts when an open thread orphans. `WidgetApp` wraps everything in `ThreadsProvider`.

**Files:**
- Modify: `packages/client/src/marker/MarkerLayer.tsx`
- Modify: `packages/client/src/app/app.tsx`
- Modify: `packages/client/src/positioning/layer.tsx` (PinLayer renders ThreadPopover per placement)
- Modify (tests): `packages/client/src/marker/MarkerLayer.test.tsx`

- [ ] **Step 1: Make `PinLayer` render highlights + a `ThreadPopover` per placement**

Replace `layer.tsx` so the overlay renders highlight rects and one `ThreadPopover` per placement (the pin is the popover's trigger). It needs the per-thread props the popover requires.

```tsx
// packages/client/src/positioning/layer.tsx
import type { ApiClient } from '../api/client'
import type { Identity } from '../identity/storage'
import type { PlacedThread } from '../threads/state'
import { ThreadPopover } from '../ui/ThreadPopover'

export type { PlacedThread } from '../threads/state'

export type PinLayerProps = {
  placements: PlacedThread[]
  client: Pick<ApiClient, 'getThread' | 'addComment' | 'setThreadStatus' | 'upload'>
  identity: Identity | null
  onNeedIdentity: (resume: (who: Identity) => void) => void
}

export function PinLayer({ placements, client, identity, onNeedIdentity }: PinLayerProps) {
  return (
    <div data-comments-overlay className="cmnt:absolute cmnt:inset-0 cmnt:pointer-events-none">
      {placements.flatMap((p) =>
        p.highlight.map((h) => (
          <div
            key={`${p.item.id}-hl-${h.x}-${h.y}-${h.width}-${h.height}`}
            data-testid="comments-highlight"
            data-comments-highlight
            className="cmnt:absolute cmnt:bg-blue-600/20 cmnt:pointer-events-none"
            // transform + dims are computed → inline
            style={{ transform: `translate(${h.x}px, ${h.y}px)`, width: h.width, height: h.height }}
          />
        )),
      )}
      {placements.map((p) => (
        <ThreadPopover
          key={p.item.id}
          item={p.item}
          pin={p.pin}
          client={client}
          identity={identity}
          onNeedIdentity={onNeedIdentity}
        />
      ))}
    </div>
  )
}
```

> `layer.test.tsx` from Task 3 now renders `ThreadPopover`, which needs a `ThreadsProvider`. Update that test to wrap the render in `<ThreadsProvider client={...}>` and pass the extra props, OR (preferred) delete the obsolete `layer.test.tsx` pin/highlight assertions and rely on `ThreadPopover.test.tsx` + `MarkerLayer.test.tsx` for coverage — the pure geometry is already covered by `coords.test.ts`. Choose deletion if the test only asserted dumb-dot rendering.

- [ ] **Step 2: Rewrite `MarkerLayer`**

```tsx
// packages/client/src/marker/MarkerLayer.tsx
import type { Provenance } from '@comments/core'
import { useCallback, useEffect, useRef, useState } from 'react'
import { captureElement, captureSelection } from '../anchor/capture'
import { createRuntime } from '../anchor/runtime'
import type { ApiClient } from '../api/client'
import { ApiError } from '../api/errors'
import { buildCaptureContext } from '../config'
import type { Identity } from '../identity/storage'
import { pinXY } from '../positioning/coords'
import { PinLayer } from '../positioning/layer'
import { observeReposition } from '../positioning/lifecycle'
import { Composer, type ComposerSubmit } from '../ui/Composer'
import { Launcher } from '../ui/Launcher'
import { useToast } from '../ui/toast'
import { useController, useDispatch, useThreadsState, useVisiblePlacements } from '../threads/useThreads'

export type MarkerLayerProps = {
  client: ApiClient
  pageKey: string
  pageUrl: string
  identity: Identity | null
  onNeedIdentity: (resume: (identity: Identity) => void) => void
  provenance?: Provenance
  resolvePageKey?: (url: string) => string
}

export function MarkerLayer({
  client,
  pageKey,
  pageUrl,
  identity,
  onNeedIdentity,
  provenance,
  resolvePageKey,
}: MarkerLayerProps) {
  const dispatch = useDispatch()
  const controller = useController()
  const state = useThreadsState()
  const placements = useVisiblePlacements()
  const [placing, setPlacing] = useState(false)
  const [activeKey, setActiveKey] = useState(pageKey)
  const toast = useToast()
  const runtime = useRef<ReturnType<typeof createRuntime> | null>(null)
  const openCount = Object.values(state.itemsById).filter((i) => i.status === 'open').length

  // biome-ignore lint/correctness/useExhaustiveDependencies: pageKey/resolvePageKey are read only inside onRouteChange which re-keys via functional setState; the runtime is keyed on the resolved activeKey.
  useEffect(() => {
    const rt = createRuntime({
      client,
      pageKey: activeKey,
      onPlacements: (next) => dispatch({ type: 'INGEST_PLACEMENTS', placements: next }),
    })
    runtime.current = rt
    void rt.refresh()
    const stop = observeReposition({
      targets: [],
      onReposition: () => rt.reposition(),
      onMutation: () => rt.rematchAll(),
      onRouteChange: () => {
        const next = resolvePageKey ? resolvePageKey(window.location.href) : pageKey
        setActiveKey((prev) => (prev === next ? prev : next))
      },
    })
    return () => {
      stop()
      rt.dispose()
      runtime.current = null
    }
  }, [client, activeKey, dispatch])

  // Toast + clear when the open thread orphaned during a re-match.
  useEffect(() => {
    if (state.lostOpenId) {
      toast('This comment’s anchor was lost')
      dispatch({ type: 'CLEAR_LOST_OPEN' })
    }
  }, [state.lostOpenId, toast, dispatch])

  const createThread = useCallback(
    async ({ text, attachmentIds, who }: ComposerSubmit, anchor: ReturnType<typeof captureElement>) => {
      try {
        const created = await client.createThread({
          pageUrl,
          pageKey: activeKey,
          anchor,
          comment: { text, attachmentIds },
          author: { email: who.email, name: who.name },
          captureContext: buildCaptureContext(),
          provenance,
        })
        dispatch({ type: 'CLEAR_DRAFT' })
        dispatch({ type: 'OPEN', id: created.id })
        await runtime.current?.refresh()
      } catch (err) {
        toast(err instanceof ApiError ? err.message : 'Failed to create comment')
      }
    },
    [client, activeKey, pageUrl, provenance, toast, dispatch],
  )

  // Place mode: next click/selection captures an anchor and opens a DRAFT popover.
  useEffect(() => {
    if (!placing) return
    const onClick = (e: MouseEvent) => {
      const target = e.target as Element | null
      if (!target || (target as HTMLElement).dataset?.commentsPlace !== undefined) return
      e.preventDefault()
      e.stopPropagation()
      setPlacing(false)
      const sel = window.getSelection()
      if (sel && !sel.isCollapsed && sel.rangeCount > 0) {
        const range = sel.getRangeAt(0)
        const anchor = captureSelection(range)
        const rect = range.getBoundingClientRect()
        dispatch({ type: 'SET_DRAFT', draft: { anchor, point: { x: rect.left, y: rect.top }, pin: pinXY(rect, anchor.offset) } })
        return
      }
      const el = document.elementFromPoint?.(e.clientX, e.clientY) ?? target
      const anchor = captureElement(el, { x: e.clientX, y: e.clientY })
      const rect = el.getBoundingClientRect()
      dispatch({ type: 'SET_DRAFT', draft: { anchor, point: { x: e.clientX, y: e.clientY }, pin: pinXY(rect, anchor.offset) } })
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPlacing(false)
    }
    document.addEventListener('click', onClick, true)
    document.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('click', onClick, true)
      document.removeEventListener('keydown', onKey, true)
    }
  }, [placing, dispatch])

  return (
    <>
      <PinLayer
        placements={placements}
        client={client}
        identity={identity}
        onNeedIdentity={onNeedIdentity}
      />
      {state.draft && (
        <div data-comments-overlay className="cmnt:absolute cmnt:inset-0 cmnt:pointer-events-none">
          <div
            data-testid="comments-draft"
            className="cmnt:absolute cmnt:w-80 cmnt:-ml-40 cmnt:mt-3 cmnt:bg-white cmnt:border cmnt:border-gray-200 cmnt:rounded-xl cmnt:pointer-events-auto cmnt:overflow-hidden cmnt:shadow-[0_12px_32px_rgba(0,0,0,0.18)]"
            style={{ transform: `translate(${state.draft.pin.x}px, ${state.draft.pin.y}px)` }} // computed → inline
          >
            <div className="cmnt:flex cmnt:justify-between cmnt:px-3 cmnt:py-2.5 cmnt:border-b cmnt:border-[#f1f3f5]">
              <span className="cmnt:text-[11px] cmnt:font-semibold cmnt:text-gray-500">New comment</span>
              <button
                type="button"
                aria-label="Discard"
                onClick={() => dispatch({ type: 'CLEAR_DRAFT' })}
                className="cmnt:border-none cmnt:bg-transparent cmnt:cursor-pointer cmnt:text-gray-500"
              >
                ✕
              </button>
            </div>
            {state.draft.anchor.selection?.quote && (
              <div className="cmnt:mx-3 cmnt:mt-2 cmnt:px-2 cmnt:py-1.5 cmnt:border-l-[3px] cmnt:border-blue-600 cmnt:bg-[#f3f6fc] cmnt:text-xs cmnt:text-gray-700 cmnt:italic">
                “{state.draft.anchor.selection.quote}”
              </div>
            )}
            <Composer
              mode="newThread"
              identity={identity}
              onNeedIdentity={onNeedIdentity}
              upload={client.upload}
              onSubmit={(payload) => createThread(payload, state.draft!.anchor)}
            />
          </div>
        </div>
      )}
      <Launcher
        placing={placing}
        onTogglePlace={() => setPlacing((p) => !p)}
        showResolved={state.showResolved}
        onShowResolved={(v) => controller.setShowResolved(v)}
        openCount={openCount}
      />
    </>
  )
}
```

- [ ] **Step 3: Wrap `WidgetApp` in `ThreadsProvider`**

In `packages/client/src/app/app.tsx`, import the provider and wrap the existing tree, passing `client`:

```tsx
import { ThreadsProvider } from '../threads/ThreadsProvider'
// ...
  return (
    <WidgetErrorBoundary>
      <WidgetProvider>
        <ToastProvider>
          <ThreadsProvider client={client}>
            <MarkerLayer
              client={client}
              pageKey={pageKey}
              pageUrl={pageUrl}
              resolvePageKey={(url) => resolvePageKey(options, url)}
              identity={identity}
              onNeedIdentity={onNeedIdentity}
              provenance={options.provenance}
            />
            <IdentityModal
              open={modalOpen}
              onOpenChange={(open) => {
                if (!open) resumeRef.current = null
                setModalOpen(open)
              }}
              onSubmit={onSubmitIdentity}
            />
          </ThreadsProvider>
        </ToastProvider>
      </WidgetProvider>
    </WidgetErrorBoundary>
  )
```

- [ ] **Step 4: Update `MarkerLayer.test.tsx`**

The existing M6 tests render `<MarkerLayer/>` directly; they must now be wrapped in `<ThreadsProvider client={c}>`. Add a `renderMarker` helper:

```tsx
import { ThreadsProvider } from '../threads/ThreadsProvider'
const renderMarker = (p: ReturnType<typeof props>) =>
  render(<ThreadsProvider client={p.client as never}><MarkerLayer {...p} /></ThreadsProvider>)
```

Then:
- The "captures the clicked element, creates a thread" test changes: after `fireEvent.click(target, …)` a **draft popover** opens (`screen.getByTestId('comments-draft')`); typing into `getByPlaceholderText(/add a comment/i)` and clicking Send calls `c.createThread` with `comment.text` = the typed text (not `'Placeholder comment'`). Update the client mock to include `getThread`, `addComment`, `setThreadStatus`, `upload` (return resolved promises) so the provider/popover render.
- The ESC test still asserts no draft opens after ESC (`queryByTestId('comments-draft')` is null).
- The selection test asserts the draft opens and, after Send, `createThread.mock.calls[0][0].anchor.selection.quote === 'brown fox'`.
- The route-change and mutation tests are unchanged except for the `ThreadsProvider` wrapper and the fuller client mock.

Add `createThread: vi.fn().mockResolvedValue({ id: 'new1', status: 'open', comments: [] })` and `getThread: vi.fn().mockResolvedValue({ id: 'new1', status: 'open', comments: [] })` to the `client()` helper.

- [ ] **Step 5: Run the integration tests**

Run: `pnpm --filter @comments/client exec vitest run src/marker/MarkerLayer.test.tsx src/positioning/layer.test.tsx src/ui/ThreadPopover.test.tsx`
Expected: PASS. Iterate on assertions until green (the draft-then-send flow is the main change from M6).

- [ ] **Step 6: Typecheck, format, commit**

```bash
pnpm --filter @comments/client exec tsc --build
pnpm format
git add packages/client/src/marker/MarkerLayer.tsx packages/client/src/app/app.tsx packages/client/src/positioning/layer.tsx packages/client/src/marker/MarkerLayer.test.tsx
git commit -m "M7: wire store into MarkerLayer — draft lifecycle, popovers, launcher, orphan toast"
```

---

## Task 13: Retrofit existing M5/M6 components to Tailwind

Convert the remaining inline-styled M5/M6 components to the `cmnt:` convention so the widget is consistent. **Pure restyle — no behavior, prop, or markup-structure changes.** The existing tests for these components assert on roles/labels/text (not pixels), so they must stay green unchanged.

**Files:**
- Modify: `packages/client/src/identity/IdentityModal.tsx`
- Modify: `packages/client/src/ui/toast.tsx`
- Modify: `packages/client/src/app/providers.tsx`

- [ ] **Step 1: `IdentityModal.tsx`** — replace each `style={{…}}` with `cmnt:` classes. Keep the Radix Dialog structure and the `Dialog.Portal container={container}` wiring. Suggested mapping:
  - `Dialog.Overlay` → `className="cmnt:fixed cmnt:inset-0 cmnt:bg-black/40 cmnt:pointer-events-auto"`
  - `Dialog.Content` → `className="cmnt:fixed cmnt:top-1/2 cmnt:left-1/2 cmnt:-translate-x-1/2 cmnt:-translate-y-1/2 cmnt:bg-white cmnt:p-6 cmnt:rounded-xl cmnt:min-w-80 cmnt:pointer-events-auto"`
  - `Dialog.Title` → `className="cmnt:mt-0"`
  - both `<input>` → `className="cmnt:block cmnt:w-full cmnt:my-3 cmnt:p-2 cmnt:border cmnt:border-gray-300 cmnt:rounded"`
  - submit `<button>` → `className="cmnt:bg-blue-600 cmnt:text-white cmnt:rounded-md cmnt:px-3 cmnt:py-2 cmnt:border-none cmnt:cursor-pointer"`

- [ ] **Step 2: `toast.tsx`** — the toasts container (`data-toasts-container`) and toast item. Keep `position: fixed`/`absolute` semantics. Mapping:
  - toast item → `className="cmnt:pointer-events-auto cmnt:bg-gray-800 cmnt:text-white cmnt:px-3 cmnt:py-2 cmnt:rounded-lg cmnt:mt-2"`
  - the `WidgetProvider` `data-toasts-container` div (in `providers.tsx`) → `className="cmnt:absolute cmnt:bottom-4 cmnt:right-4 cmnt:pointer-events-none"`

- [ ] **Step 3: `providers.tsx`** — the `data-portal-container` div → `className="cmnt:absolute"`; the `data-toasts-container` div as in Step 2. Keep the `ref={setPortal}`/`ref={setToasts}` wiring intact.

- [ ] **Step 4: Run the affected tests**

Run: `pnpm --filter @comments/client exec vitest run src/identity src/ui/toast.test.tsx src/app`
Expected: PASS unchanged (these tests assert behavior/labels, not styles). If any test asserted a specific inline style, update it to assert the className or the role/label instead.

- [ ] **Step 5: Build CSS, typecheck, format, commit**

```bash
pnpm --filter @comments/client build:css
pnpm --filter @comments/client exec tsc --build
pnpm format
git add packages/client/src/identity/IdentityModal.tsx packages/client/src/ui/toast.tsx packages/client/src/app/providers.tsx packages/client/src/app/widget-css.generated.ts
git commit -m "M7: retrofit M5/M6 components (IdentityModal, toast, providers) to Tailwind cmnt:"
```

---

## Task 14: Accessibility smoke + focus verification

**Files:**
- Test: `packages/client/src/app/app.test.tsx` (extend the existing smoke test)

- [ ] **Step 1: Extend the app smoke test for the launcher's accessible controls**

In `packages/client/src/app/app.test.tsx`, add (using the file's existing render harness + client mock — ensure the mock provides `listThreads`/`getThread`):

```tsx
it('renders the launcher with accessible controls', async () => {
  expect(await screen.findByTestId('comments-place')).toBeInTheDocument()
  expect(screen.getByRole('switch', { name: /resolved/i })).toBeInTheDocument()
})
```

- [ ] **Step 2: Verify Radix focus management (read-only)**

`@radix-ui/react-popover` traps focus in `Popover.Content`, closes on Esc, and returns focus to `Popover.Trigger` (the pin) on close — no manual wiring needed. Confirm by reading the component; nothing to implement. Pin `aria-label`s (Task 5), the labelled `switch` (Task 11), and the labelled `Attach`/`Remove`/`Close`/`Retry` buttons cover the rest.

- [ ] **Step 3: Run app tests, typecheck, format, commit**

```bash
pnpm --filter @comments/client exec vitest run src/app/app.test.tsx
pnpm --filter @comments/client exec tsc --build
pnpm format
git add packages/client/src/app/app.test.tsx
git commit -m "M7: a11y smoke test for launcher controls"
```

---

## Task 15: Full suite, lint, bundle-size budget, final commit

**Files:** none (verification task).

- [ ] **Step 1: Run the entire client test suite**

Run: `pnpm --filter @comments/client test`
Expected: all suites PASS.

- [ ] **Step 2: Typecheck the whole repo**

Run: `pnpm typecheck`
Expected: PASS. (If a poisoned turbo cache reports "cannot find declaration for @comments/*", purge `~/.turbo` + all `*.tsbuildinfo` and retry — see project memory.)

- [ ] **Step 3: Lint/format**

Run: `pnpm format` then `pnpm lint`
Expected: Biome reports no errors.

- [ ] **Step 4: Bundle-size budget**

Run: `pnpm --filter @comments/client build && pnpm --filter @comments/client size`
Expected: `@comments/client (esm, brotli)` under the 300 kB budget (the Radix Popover addition must fit). If it fails, report the delta — do not silently raise the limit.

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "M7: commenting UI complete — full suite + lint + size green"
```

---

## Notes for the implementer

- **No contract/schema changes.** Every call (`createThread`, `listThreads`, `getThread`, `addComment`, `setThreadStatus`, `upload`) already exists on the M5 `ApiClient`. Do not touch `@comments/core` or `@comments/server`.
- **Branded ids in tests.** `Thread`/`Comment`/`ThreadListItem` use zod-branded ids; in tests build fixtures with `as unknown as <Type>` casts (as shown). In app code, optimistic comments cast their temp id the same way.
- **Viewport coords.** Never add scroll offset in pin/highlight math — `coords.ts` is viewport-relative because the overlay host is `position: fixed`.
- **Resolved attribution.** The header shows "Resolved" with no name — `ThreadBase` has `createdBy` only; do not add `resolvedBy` (frozen schema).
- **Pagination.** The local list is page one only (M6's `refresh()` ignores `nextCursor`); the client-side resolved filter therefore covers the first page. Cross-page listing is M8.
- **`openThread` scroll-into-view is deferred.** The spec notes `openThread` "scrolls the pin into view"; for single-page M7 the popover opens in-viewport, and the pin lives in a `position: fixed` overlay (scrolling it does nothing useful). The meaningful scroll-to-the-anchored-element happens after cross-page navigation, which is **M8**'s job using this same `openThread(id)` seam. M7's `openThread` only opens the popover + lazy-loads detail.
