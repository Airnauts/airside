// packages/client/src/threads/controller.ts
import type { ThreadStatus } from '@airnauts/airside-core'
import type { ApiClient } from '../api/client'
import type { Action } from './state'

export type Controller = {
  openThread(id: string): void
  close(): void
  setShowResolved(value: boolean): void
  /** Optimistically set a thread's status (store + runtime cache) and persist; rolls back on failure. */
  setStatus(id: string, status: ThreadStatus): Promise<boolean>
  /**
   * Optimistically patch a thread's status in the store AND the runtime cache WITHOUT persisting.
   * The reply flow uses this to reopen a resolved thread instantly, then persists the reopen only
   * after the reply itself has been saved — so the two network calls can't race. Keeping the runtime
   * cache in sync is what stops a reposition/mutation re-emit from clobbering the optimistic flip.
   */
  patchStatus(id: string, status: ThreadStatus): void
  /**
   * Run a server-evaluated thread action (e.g. "create Jira issue"). Marks the action in-flight so
   * the toolbar can disable/spin, calls the API, and on success replaces the cached detail with the
   * returned {@link ThreadView} — refreshing BOTH `actions` and `externalLinks` (a now-unavailable
   * action disappears, a new link appears). Notifies the status listener (status may have changed)
   * and returns `true`; on failure clears the flag and returns `false` (never throws — the UI toasts).
   */
  runAction(id: string, actionId: string): Promise<boolean>
  /**
   * Optimistically adjust a thread's comment count by `delta` (+1 on an optimistic reply, -1 to roll
   * back a failed one). Patches the store (pin badge) AND the runtime cache (so the next reposition/
   * mutation re-emit doesn't clobber it) AND notifies the panel so its list rows stay in sync. The
   * sidebar/popover header reads the live detail's comment list directly, so it needs no patch here.
   */
  bumpCommentCount(id: string, delta: number): void
  /**
   * Optimistically delete a thread: drop it from the store (REMOVE_THREAD — closes its popover and
   * clears any focus/lost-open ref) AND the runtime cache (so the next reposition emit can't resurrect
   * its pin), then persist via the API. On failure, calls `runtime.refresh()` to re-fetch the list (the
   * thread still exists server-side) — restoring the store — and returns `false` so the UI can toast.
   * Returns `true` on success. Never throws.
   */
  deleteThread(id: string): Promise<boolean>
  /**
   * MarkerLayer registers the live anchor-runtime here so status/count changes also patch its cached
   * item list. Without this, the runtime re-emits stale placements on the next reposition/mutation,
   * clobbering the optimistic update (the pin would revert until a full reload).
   */
  registerRuntime(
    patch: {
      setStatus: (id: string, status: ThreadStatus) => void
      bumpCommentCount: (id: string, delta: number) => void
      removeItem: (id: string) => void
      refresh: () => Promise<void>
    } | null,
  ): void
  /** Focus a pin: arm the focus effect (scroll + pulse) and lazy-fetch its detail — WITHOUT opening
   * its popover. The sidebar detail is the surface that shows the thread; the popover opens only on a
   * direct pin click. */
  requestFocus(id: string): void
  /** Re-fetch a thread's detail by id without opening its popover (the sidebar detail's retry path). */
  refetch(id: string): void
  /** The panel registers here to refetch its list when a status change persists (drawer-open reconciliation). */
  registerStatusListener(fn: ((id: string, status: ThreadStatus) => void) | null): void
  /** The panel registers here to keep its list rows' counts in sync with an optimistic reply. */
  registerCommentCountListener(fn: ((id: string, delta: number) => void) | null): void
  /** The panel registers here to refetch its list when a new thread is created while it's open. */
  registerThreadCreatedListener(fn: (() => void) | null): void
  /**
   * Notify the registered thread-created listener (the open panel) that a thread was just created.
   * MarkerLayer fires this after a successful `client.createThread`. The panel's list store is
   * separate from the on-page placements, so without this its rows stay stale until reopen.
   */
  notifyThreadCreated(): void
  /** The panel registers here to drop a deleted thread from its list and, if it was the open detail, leave it. */
  registerDeleteListener(fn: ((id: string) => void) | null): void
}

/**
 * The imperative surface over the store. M8 calls `openThread(id)` to focus a pin
 * after cross-page navigation; M7 uses it for pin clicks. Opening triggers the lazy
 * `getThread` fetch (fire-and-forget; the reducer tracks loading/error).
 */
export function createController(
  dispatch: (a: Action) => void,
  deps: {
    client: Pick<ApiClient, 'getThread' | 'setThreadStatus' | 'runThreadAction' | 'deleteThread'>
    isCached: (id: string) => boolean
    isLoading: (id: string) => boolean
  },
): Controller {
  let runtime: {
    setStatus: (id: string, status: ThreadStatus) => void
    bumpCommentCount: (id: string, delta: number) => void
    removeItem: (id: string) => void
    refresh: () => Promise<void>
  } | null = null
  let statusListener: ((id: string, status: ThreadStatus) => void) | null = null
  let commentCountListener: ((id: string, delta: number) => void) | null = null
  let threadCreatedListener: (() => void) | null = null
  let deleteListener: ((id: string) => void) | null = null

  const lazyFetchDetail = (id: string) => {
    if (deps.isCached(id) || deps.isLoading(id)) return
    dispatch({ type: 'DETAIL_LOADING', id })
    deps.client
      .getThread(id)
      .then((thread) => dispatch({ type: 'DETAIL_LOADED', id, thread }))
      .catch(() => dispatch({ type: 'DETAIL_ERROR', id }))
  }

  // Optimistic store + runtime patch, no network. Shared by setStatus (which then persists) and
  // exposed directly for the reply flow (which persists separately, after the reply is saved).
  const patchStatus = (id: string, status: ThreadStatus) => {
    dispatch({ type: 'SET_STATUS', id, status })
    runtime?.setStatus(id, status)
  }

  // Optimistic comment-count adjustment with no network. Store (pin badge) + runtime cache
  // (so the next re-emit doesn't clobber it) + panel notify (its list rows). The reply flow
  // calls +1 when it adds an optimistic comment and -1 if the save fails.
  const bumpCommentCount = (id: string, delta: number) => {
    dispatch({ type: 'BUMP_COMMENT_COUNT', id, delta })
    runtime?.bumpCommentCount(id, delta)
    commentCountListener?.(id, delta)
  }

  return {
    openThread(id) {
      dispatch({ type: 'OPEN', id })
      lazyFetchDetail(id)
    },
    close() {
      dispatch({ type: 'CLOSE' })
    },
    setShowResolved(value) {
      dispatch({ type: 'SET_SHOW_RESOLVED', value })
    },
    registerRuntime(patch) {
      runtime = patch
    },
    patchStatus,
    bumpCommentCount,
    async setStatus(id, status) {
      const prev: ThreadStatus = status === 'resolved' ? 'open' : 'resolved'
      // Optimistic: update the store (instant pin/header) AND the runtime cache (so the next
      // reposition/mutation re-emit doesn't overwrite it with the stale listed status).
      patchStatus(id, status)
      try {
        await deps.client.setThreadStatus(id, { status })
        statusListener?.(id, status)
        return true
      } catch {
        patchStatus(id, prev)
        return false
      }
    },
    async deleteThread(id) {
      // Optimistic teardown up front: store (closes the popover, clears focus refs) + runtime cache
      // (so the next reposition emit can't resurrect the pin). Then persist.
      dispatch({ type: 'REMOVE_THREAD', id })
      runtime?.removeItem(id)
      try {
        await deps.client.deleteThread(id)
        // Notify the panel so its own list/detail state drops the gone thread (the panel keeps an
        // independent store the REMOVE_THREAD above doesn't touch).
        deleteListener?.(id)
        return true
      } catch {
        // Rollback: the thread still exists server-side, so re-fetch the list and re-place. We
        // deliberately don't snapshot/re-insert a placement (it's DOM-bound and fragile).
        await runtime?.refresh().catch(() => {})
        return false
      }
    },
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
    },
    requestFocus(id) {
      dispatch({ type: 'REQUEST_FOCUS', id })
      lazyFetchDetail(id)
    },
    refetch(id) {
      lazyFetchDetail(id)
    },
    registerStatusListener(fn) {
      statusListener = fn
    },
    registerCommentCountListener(fn) {
      commentCountListener = fn
    },
    notifyThreadCreated() {
      threadCreatedListener?.()
    },
    registerThreadCreatedListener(fn) {
      threadCreatedListener = fn
    },
    registerDeleteListener(fn) {
      deleteListener = fn
    },
  }
}
