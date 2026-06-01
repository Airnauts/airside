// packages/client/src/panel/controller.ts
import type { ApiClient } from '../api/client'
import type { Action, PanelFilter, PanelState } from './state'

export type PanelController = {
  openPanel(): Promise<void>
  closePanel(): void
  setFilter(filter: PanelFilter): Promise<void>
  loadMore(): Promise<void>
  refresh(): Promise<void>
}

export function createPanelController(
  dispatch: (a: Action) => void,
  deps: { client: Pick<ApiClient, 'listThreads'>; getState: () => PanelState },
): PanelController {
  const statusParam = (filter: PanelFilter) => (filter === 'all' ? {} : { status: filter })

  async function load(filter: PanelFilter): Promise<void> {
    dispatch({ type: 'LOAD_START' })
    try {
      const [main, review] = await Promise.all([
        deps.client.listThreads({ sort: 'updatedAt', ...statusParam(filter) }),
        deps.client.listThreads({ status: 'open' }),
      ])
      dispatch({
        type: 'LOAD_SUCCESS',
        list: main.threads,
        nextCursor: main.nextCursor,
        needsReview: review.threads.filter((t) => t.anchorState === 'orphaned'),
      })
    } catch {
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
  }
}
