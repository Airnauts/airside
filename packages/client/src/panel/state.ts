// packages/client/src/panel/state.ts
import type { AnchorState, ThreadListItem, ThreadStatus } from '@airnauts/airside-core'

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
  /**
   * Comment ids already counted into the list, so the two inbound paths for a current-page
   * comment — the page-stream bridge and the all-pages stream (ADR-0045) — converge to a
   * single increment. Reset on every full (re)load, which re-reads authoritative counts.
   */
  appliedCommentIds: string[]
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
  appliedCommentIds: [],
}

/** Cap the applied-comment-id memory so a long-open drawer can't grow it without bound. */
const APPLIED_COMMENT_CAP = 500

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
  // Live reconciliation from the all-pages stream (ADR-0045).
  | { type: 'UPSERT_THREAD'; thread: ThreadListItem }
  | { type: 'PATCH_STATUS'; id: string; status: ThreadStatus; anchorState: AnchorState }
  | { type: 'APPLY_COMMENT'; id: string; commentId: string }

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

/** Insert a thread (newest-first under the updatedAt sort) or replace it in place if already listed. */
function upsertThread(list: ThreadListItem[], thread: ThreadListItem): ThreadListItem[] {
  const idx = list.findIndex((t) => t.id === thread.id)
  if (idx === -1) return [thread, ...list]
  const next = list.slice()
  next[idx] = thread
  return next
}

/** Patch a row's status + anchorState (idempotent), recomputing unresolvedCount from status. */
function patchStatus(
  list: ThreadListItem[],
  id: string,
  status: ThreadStatus,
  anchorState: AnchorState,
): ThreadListItem[] {
  let changed = false
  const next = list.map((t) => {
    if (t.id !== id) return t
    changed = true
    const unresolvedCount = status === 'resolved' ? 0 : Math.max(1, t.unresolvedCount)
    return { ...t, status, anchorState, unresolvedCount }
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
        // Loaded counts are authoritative; reset the dedupe ledger so it can't grow unbounded.
        appliedCommentIds: [],
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
    case 'UPSERT_THREAD':
      // A thread created/updated on any page: insert it (prepended) or replace it in place, so a
      // thread created on another page appears live in the cross-page list without a refetch.
      return {
        ...state,
        list: upsertThread(state.list, action.thread),
        needsReview:
          action.thread.anchorState === 'orphaned'
            ? upsertThread(state.needsReview, action.thread)
            : state.needsReview,
      }
    case 'PATCH_STATUS':
      return {
        ...state,
        list: patchStatus(state.list, action.id, action.status, action.anchorState),
        needsReview: patchStatus(state.needsReview, action.id, action.status, action.anchorState),
      }
    case 'APPLY_COMMENT': {
      // Idempotent by comment id: the bridge and the all-pages stream both deliver the same
      // current-page comment, so count it exactly once.
      if (state.appliedCommentIds.includes(action.commentId)) return state
      return {
        ...state,
        list: bumpCount(state.list, action.id, 1),
        needsReview: bumpCount(state.needsReview, action.id, 1),
        appliedCommentIds: [...state.appliedCommentIds, action.commentId].slice(
          -APPLIED_COMMENT_CAP,
        ),
      }
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

/** Does a thread's status satisfy the active filter? `all` matches everything. */
export function matchesFilter(status: ThreadStatus, filter: PanelFilter): boolean {
  return filter === 'all' || status === filter
}

/**
 * The rows to render: Needs-review excluded, then filtered by the active filter. The filter
 * pass is what makes a live resolve (PATCH_STATUS) drop a row out of the `open` list without a
 * refetch — `list` may still hold it (e.g. a live UPSERT) until the next full reload re-sorts.
 */
export function selectVisibleList(state: PanelState): ThreadListItem[] {
  return mainListExcludingReview(state).filter((t) => matchesFilter(t.status, state.filter))
}
