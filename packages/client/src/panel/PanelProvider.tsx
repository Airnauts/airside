// packages/client/src/panel/PanelProvider.tsx
import { createContext, type ReactNode, useContext, useMemo, useReducer, useRef } from 'react'
import type { ApiClient } from '../api/client'
import { createPanelController, type PanelController } from './controller'
import { initialState, type PanelState, reducer } from './state'

type PanelContextValue = { state: PanelState; controller: PanelController }

const PanelContext = createContext<PanelContextValue | null>(null)

export function PanelProvider({
  client,
  children,
}: {
  client: Pick<ApiClient, 'listThreads'>
  children: ReactNode
}) {
  const [state, dispatch] = useReducer(reducer, initialState)
  const stateRef = useRef(state)
  stateRef.current = state

  const controller = useMemo(
    () => createPanelController(dispatch, { client, getState: () => stateRef.current }),
    [client],
  )

  const value = useMemo<PanelContextValue>(() => ({ state, controller }), [state, controller])
  return <PanelContext.Provider value={value}>{children}</PanelContext.Provider>
}

function useCtx() {
  const ctx = useContext(PanelContext)
  if (!ctx) throw new Error('usePanel hooks must be used within <PanelProvider>')
  return ctx
}

export function usePanelState() {
  return useCtx().state
}

export function usePanelController() {
  return useCtx().controller
}
