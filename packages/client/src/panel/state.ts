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
