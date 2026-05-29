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
