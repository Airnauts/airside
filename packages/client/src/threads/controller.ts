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
   * MarkerLayer registers the live anchor-runtime here so status changes also patch its cached
   * item list. Without this, the runtime re-emits stale 'open' placements on the next reposition/
   * mutation, clobbering the optimistic update (the pin would revert until a full reload).
   */
  registerRuntime(patch: ((id: string, status: ThreadStatus) => void) | null): void
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

  return {
    openThread(id) {
      dispatch({ type: 'OPEN', id })
      if (deps.isCached(id) || deps.isLoading(id)) return
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
    registerRuntime(patch) {
      patchRuntime = patch
    },
    async setStatus(id, status) {
      const prev: ThreadStatus = status === 'resolved' ? 'open' : 'resolved'
      // Optimistic: update the store (instant pin/header) AND the runtime cache (so the next
      // reposition/mutation re-emit doesn't overwrite it with the stale listed status).
      dispatch({ type: 'SET_STATUS', id, status })
      patchRuntime?.(id, status)
      try {
        await deps.client.setThreadStatus(id, { status })
        return true
      } catch {
        dispatch({ type: 'SET_STATUS', id, status: prev })
        patchRuntime?.(id, prev)
        return false
      }
    },
  }
}
