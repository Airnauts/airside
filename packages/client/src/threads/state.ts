// packages/client/src/threads/state.ts
import type {
  Anchor,
  Comment,
  ThreadListItem,
  ThreadStatus,
  ThreadView,
} from '@airnauts/airside-core'
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
  detailById: Record<string, ThreadView>
  loadingDetail: Record<string, boolean>
  detailError: Record<string, boolean>
  /** Thread id → the action id currently running on it (in-flight), absent when idle. */
  runningActionById: Record<string, string | null>
  draft: Draft | null
  showResolved: boolean
  /** Set when an open thread orphaned out of an ingest; the view toasts + clears it. */
  lostOpenId: string | null
  /** A thread the panel asked us to focus; the focus effect waits for its placement. */
  pendingFocusId: string | null
  /** A just-focused thread; its pin pulses briefly. */
  focusedId: string | null
}

export const initialState: ThreadsState = {
  itemsById: {},
  placementsById: {},
  order: [],
  openId: null,
  detailById: {},
  loadingDetail: {},
  detailError: {},
  runningActionById: {},
  draft: null,
  showResolved: false,
  lostOpenId: null,
  pendingFocusId: null,
  focusedId: null,
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
  | { type: 'DETAIL_LOADED'; id: string; thread: ThreadView }
  | { type: 'DETAIL_ERROR'; id: string }
  | { type: 'ACTION_RUNNING'; id: string; actionId: string }
  | { type: 'ACTION_DONE'; id: string }
  | { type: 'ADD_OPTIMISTIC_COMMENT'; id: string; comment: Comment }
  | { type: 'REPLACE_OPTIMISTIC_COMMENT'; id: string; tempId: string; comment: Comment }
  | { type: 'REMOVE_OPTIMISTIC_COMMENT'; id: string; tempId: string }
  | { type: 'SET_STATUS'; id: string; status: ThreadStatus }
  | { type: 'BUMP_COMMENT_COUNT'; id: string; delta: number }
  | { type: 'REQUEST_FOCUS'; id: string }
  | { type: 'FOCUS_PLACED'; id: string }
  | { type: 'CLEAR_FOCUS' }
  | { type: 'CLEAR_PENDING_FOCUS' }
  | { type: 'REMOVE_THREAD'; id: string }

function mapDetail(
  state: ThreadsState,
  id: string,
  fn: (t: ThreadView) => ThreadView,
): ThreadsState {
  const t = state.detailById[id]
  // Safe no-op: optimistic actions are only dispatched from an open thread, whose detail is always loaded.
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
      // Only "lose" an open thread that WAS placed (had a pin) and has now dropped out — a genuine
      // orphan-while-open. A panel-opened thread that was never placed (the detached/orphan card)
      // must survive routine reposition emits, which re-ingest without it every scroll/resize.
      const openId = state.openId
      const wasPlaced = openId !== null && openId in state.placementsById
      const openGone = wasPlaced && !(openId in itemsById)
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
    case 'DETAIL_LOADING': {
      const { [action.id]: _e, ...error } = state.detailError
      return {
        ...state,
        loadingDetail: { ...state.loadingDetail, [action.id]: true },
        detailError: error,
      }
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
    case 'ACTION_RUNNING':
      return {
        ...state,
        runningActionById: { ...state.runningActionById, [action.id]: action.actionId },
      }
    case 'ACTION_DONE': {
      const { [action.id]: _r, ...running } = state.runningActionById
      return { ...state, runningActionById: running }
    }
    case 'ADD_OPTIMISTIC_COMMENT':
      return mapDetail(state, action.id, (t) => ({
        ...t,
        comments: [...t.comments, action.comment],
      }))
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
      // Keep the list item in sync so the pin (status/count) reacts immediately, not
      // just after a refresh. A resolved thread carries no unresolved comments; reopening
      // restores the count to 1 (the list refetch reconciles the exact number).
      const unresolvedCount =
        action.status === 'resolved' ? 0 : Math.max(1, item?.unresolvedCount ?? 1)
      const withItem = item
        ? {
            ...state,
            itemsById: {
              ...state.itemsById,
              [action.id]: { ...item, status: action.status, unresolvedCount },
            },
          }
        : state
      return mapDetail(withItem, action.id, (t) => ({ ...t, status: action.status }))
    }
    case 'BUMP_COMMENT_COUNT': {
      // Keep the list item's count in sync with an optimistic reply so the pin badge reacts
      // immediately (the sidebar/popover header reads the live detail instead). itemsById is
      // rebuilt from the runtime cache on every reposition emit, so the controller also patches
      // that cache — without it the next scroll/resize would clobber this back to the listed count.
      const item = state.itemsById[action.id]
      if (!item) return state
      return {
        ...state,
        itemsById: {
          ...state.itemsById,
          [action.id]: { ...item, commentCount: Math.max(0, item.commentCount + action.delta) },
        },
      }
    }
    case 'REQUEST_FOCUS':
      // Focusing a pin pulses/scrolls it and lazy-loads its detail — but does NOT open its popover.
      // (It used to set openId, which both opened the popover and keyed the detail read; the sidebar
      // detail now owns that surface, so focus must not yank the popover open.)
      return {
        ...state,
        draft: null,
        pendingFocusId: action.id,
        focusedId: null,
      }
    case 'FOCUS_PLACED':
      return { ...state, focusedId: action.id, pendingFocusId: null }
    case 'CLEAR_FOCUS':
      return { ...state, focusedId: null }
    case 'CLEAR_PENDING_FOCUS':
      return { ...state, pendingFocusId: null }
    case 'REMOVE_THREAD': {
      // Optimistic hard-remove: drop the id from every by-id map + order, and clear any
      // dangling reference (open popover, pending/active focus, lost-open flag) that points
      // at the now-gone thread so no surface tries to render or focus it.
      const { id } = action
      const drop = <T>(map: Record<string, T>): Record<string, T> => {
        if (!(id in map)) return map
        const { [id]: _gone, ...rest } = map
        return rest
      }
      return {
        ...state,
        itemsById: drop(state.itemsById),
        placementsById: drop(state.placementsById),
        order: state.order.includes(id) ? state.order.filter((x) => x !== id) : state.order,
        detailById: drop(state.detailById),
        loadingDetail: drop(state.loadingDetail),
        detailError: drop(state.detailError),
        runningActionById: drop(state.runningActionById),
        openId: state.openId === id ? null : state.openId,
        pendingFocusId: state.pendingFocusId === id ? null : state.pendingFocusId,
        focusedId: state.focusedId === id ? null : state.focusedId,
        lostOpenId: state.lostOpenId === id ? null : state.lostOpenId,
      }
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
    // Hide resolved threads unless showResolved — but never hide one that's open or being focused,
    // so resolving from its popover flips the pin to ✓ in place (rather than vanishing) and focusing
    // a resolved thread from the sidebar still finds its pin to pulse.
    if (
      item.status === 'resolved' &&
      !state.showResolved &&
      id !== state.openId &&
      id !== state.pendingFocusId &&
      id !== state.focusedId
    )
      continue
    out.push({ item, pin: geo.pin, highlight: geo.highlight })
  }
  return out
}
