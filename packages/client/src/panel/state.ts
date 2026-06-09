// packages/client/src/panel/state.ts
import type { ThreadListItem } from '@airnauts/comments-core'

export type PanelFilter = 'open' | 'resolved' | 'all'

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

export type Action =
  | { type: 'OPEN' }
  | { type: 'CLOSE' }
  | { type: 'OPEN_DETAIL'; id: string }
  | { type: 'BACK' }
  | { type: 'SET_FILTER'; filter: PanelFilter }
  | { type: 'LOAD_START' }
  | {
      type: 'LOAD_SUCCESS'
      list: ThreadListItem[]
      nextCursor: string | null
      needsReview: ThreadListItem[]
    }
  | { type: 'LOAD_ERROR' }
  | { type: 'LOAD_MORE_START' }
  | { type: 'LOAD_MORE_SUCCESS'; list: ThreadListItem[]; nextCursor: string | null }
  | { type: 'LOAD_MORE_ERROR' }
  | { type: 'BUMP_COMMENT_COUNT'; id: string; delta: number }

/** Apply a comment-count delta to a matching list item, clamped at zero. */
function bumpCount(list: ThreadListItem[], id: string, delta: number): ThreadListItem[] {
  let changed = false
  const next = list.map((t) => {
    if (t.id !== id) return t
    changed = true
    return { ...t, commentCount: Math.max(0, t.commentCount + delta) }
  })
  return changed ? next : list
}

export function reducer(state: PanelState, action: Action): PanelState {
  switch (action.type) {
    case 'OPEN':
      return { ...state, open: true }
    case 'CLOSE':
      return { ...state, open: false, view: 'list', detailThreadId: null }
    case 'OPEN_DETAIL':
      return { ...state, view: 'detail', detailThreadId: action.id }
    case 'BACK':
      return { ...state, view: 'list', detailThreadId: null }
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
    case 'BUMP_COMMENT_COUNT':
      // Keep the collapsed list rows' "N Replies" in sync with an optimistic reply posted from the
      // open detail, so going back to the list shows the new count without a refetch.
      return {
        ...state,
        list: bumpCount(state.list, action.id, action.delta),
        needsReview: bumpCount(state.needsReview, action.id, action.delta),
      }
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
