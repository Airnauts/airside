// packages/client/src/panel/controller.ts
import type { AnchorState, ThreadListItem, ThreadStatus } from '@airnauts/airside-core'
import type { ApiClient } from '../api/client'
import type { Action, PanelFilter, PanelState } from './state'

export type PanelController = {
  openPanel(): Promise<void>
  closePanel(): void
  setFilter(filter: PanelFilter): Promise<void>
  loadMore(): Promise<void>
  refresh(): Promise<void>
  openDetail(id: string): void
  back(): void
  /** Optimistically adjust a list row's comment count (mirrors an optimistic reply in the detail). */
  bumpCommentCount(id: string, delta: number): void
  /** Drop a deleted thread from the list/needsReview and, if its detail is open, fall back to the list. */
  removeThread(id: string): void
  // Live reconciliation from the all-pages stream (ADR-0050).
  /** Insert/replace a thread row (a thread created/updated on any page appears without a refetch). */
  upsertThread(thread: ThreadListItem): void
  /** Patch a row's status + anchorState in place (idempotent). */
  patchStatus(id: string, status: ThreadStatus, anchorState: AnchorState): void
  /** Count a live comment once, deduped by comment id (converges with the optimistic bridge). */
  applyComment(threadId: string, commentId: string): void
}

export function createPanelController(
  dispatch: (a: Action) => void,
  deps: { client: Pick<ApiClient, 'listThreads'>; getState: () => PanelState },
): PanelController {
  const statusParam = (filter: PanelFilter) => (filter === 'all' ? {} : { status: filter })

  // Latest-wins guard. Focus, visibilitychange, and onConnect all trigger loads, so overlapping
  // fetches are common; a slower earlier one must not resolve after a newer one and clobber the
  // list — worse, LOAD_SUCCESS resets the live-applied-comment ledger, so a stale win would drop
  // counts reconciled from the stream. Each load takes a token; only the latest may dispatch.
  let loadSeq = 0

  async function load(filter: PanelFilter): Promise<void> {
    const seq = ++loadSeq
    dispatch({ type: 'LOAD_START' })
    try {
      const [main, review] = await Promise.all([
        deps.client.listThreads({ sort: 'updatedAt', ...statusParam(filter) }),
        deps.client.listThreads({ status: 'open' }),
      ])
      if (seq !== loadSeq) return // superseded by a newer load
      dispatch({
        type: 'LOAD_SUCCESS',
        list: main.threads,
        nextCursor: main.nextCursor,
        needsReview: review.threads.filter((t) => t.anchorState === 'orphaned'),
      })
    } catch {
      if (seq !== loadSeq) return // a stale error must not clobber a newer load either
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
    openDetail(id) {
      dispatch({ type: 'OPEN_DETAIL', id })
    },
    back() {
      dispatch({ type: 'BACK' })
    },
    bumpCommentCount(id, delta) {
      dispatch({ type: 'BUMP_COMMENT_COUNT', id, delta })
    },
    removeThread(id) {
      dispatch({ type: 'REMOVE_THREAD', id })
    },
    upsertThread(thread) {
      dispatch({ type: 'UPSERT_THREAD', thread })
    },
    patchStatus(id, status, anchorState) {
      dispatch({ type: 'PATCH_STATUS', id, status, anchorState })
    },
    applyComment(threadId, commentId) {
      dispatch({ type: 'APPLY_COMMENT', id: threadId, commentId })
    },
  }
}
