// packages/client/src/threads/controller.ts
import type { ThreadStatus } from '@comments/core'
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
   * MarkerLayer registers the live anchor-runtime here so status changes also patch its cached
   * item list. Without this, the runtime re-emits stale 'open' placements on the next reposition/
   * mutation, clobbering the optimistic update (the pin would revert until a full reload).
   */
  registerRuntime(patch: ((id: string, status: ThreadStatus) => void) | null): void
  /** Focus a pin: open + lazy-fetch like openThread, but also arm the focus effect (scroll + pulse). */
  requestFocus(id: string): void
  /** The panel registers here to refetch its list when a status change persists (drawer-open reconciliation). */
  registerStatusListener(fn: ((id: string, status: ThreadStatus) => void) | null): void
}

/**
 * The imperative surface over the store. M8 calls `openThread(id)` to focus a pin
 * after cross-page navigation; M7 uses it for pin clicks. Opening triggers the lazy
 * `getThread` fetch (fire-and-forget; the reducer tracks loading/error).
 */
export function createController(
  dispatch: (a: Action) => void,
  deps: {
    client: Pick<ApiClient, 'getThread' | 'setThreadStatus'>
    isCached: (id: string) => boolean
    isLoading: (id: string) => boolean
  },
): Controller {
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

  // Optimistic store + runtime patch, no network. Shared by setStatus (which then persists) and
  // exposed directly for the reply flow (which persists separately, after the reply is saved).
  const patchStatus = (id: string, status: ThreadStatus) => {
    dispatch({ type: 'SET_STATUS', id, status })
    patchRuntime?.(id, status)
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
      patchRuntime = patch
    },
    patchStatus,
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
    requestFocus(id) {
      dispatch({ type: 'REQUEST_FOCUS', id })
      lazyFetchDetail(id)
    },
    registerStatusListener(fn) {
      statusListener = fn
    },
  }
}
