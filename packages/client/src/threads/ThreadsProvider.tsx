// packages/client/src/threads/ThreadsProvider.tsx
import { createContext, type ReactNode, useMemo, useReducer, useRef } from 'react'
import type { ApiClient } from '../api/client'
import { type Controller, createController } from './controller'
import { type Action, initialState, reducer, type ThreadsState } from './state'

export type ThreadsContextValue = {
  state: ThreadsState
  dispatch: (a: Action) => void
  controller: Controller
}

export const ThreadsContext = createContext<ThreadsContextValue | null>(null)

export function ThreadsProvider({
  client,
  children,
}: {
  client: Pick<ApiClient, 'getThread' | 'setThreadStatus' | 'runThreadAction' | 'deleteThread'>
  children: ReactNode
}) {
  const [state, dispatch] = useReducer(reducer, initialState)
  // Keep a live ref so the controller (created once) reads fresh cache state.
  const stateRef = useRef(state)
  stateRef.current = state

  const controller = useMemo(
    () =>
      createController(dispatch, {
        client,
        isCached: (id) => id in stateRef.current.detailById,
        isLoading: (id) => Boolean(stateRef.current.loadingDetail[id]),
      }),
    [client],
  )

  const value = useMemo<ThreadsContextValue>(
    () => ({ state, dispatch, controller }),
    [state, controller],
  )
  return <ThreadsContext.Provider value={value}>{children}</ThreadsContext.Provider>
}
