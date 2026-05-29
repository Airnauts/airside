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
