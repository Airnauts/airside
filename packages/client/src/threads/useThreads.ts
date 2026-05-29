// packages/client/src/threads/useThreads.ts

import type { Thread } from '@comments/core'
import { useContext } from 'react'
import { type PlacedThread, visiblePlacements } from './state'
import { ThreadsContext } from './ThreadsProvider'

function useCtx() {
  const ctx = useContext(ThreadsContext)
  if (!ctx) throw new Error('useThreads* must be used within <ThreadsProvider>')
  return ctx
}

export function useThreadsState() {
  return useCtx().state
}

export function useController() {
  return useCtx().controller
}

export function useDispatch() {
  return useCtx().dispatch
}

export function useVisiblePlacements(): PlacedThread[] {
  return visiblePlacements(useCtx().state)
}

export function useShowResolved(): boolean {
  return useCtx().state.showResolved
}

export function useOpenThread(): {
  openId: string | null
  detail: Thread | null
  loading: boolean
  error: boolean
} {
  const { state } = useCtx()
  const id = state.openId
  return {
    openId: id,
    detail: id ? (state.detailById[id] ?? null) : null,
    loading: id ? Boolean(state.loadingDetail[id]) : false,
    error: id ? Boolean(state.detailError[id]) : false,
  }
}
