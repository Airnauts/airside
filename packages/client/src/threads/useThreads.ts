// packages/client/src/threads/useThreads.ts

import type { ExternalLink, Thread, ThreadActionDescriptor } from '@airnauts/airside-core'
import { useContext } from 'react'
import { type PlacedThread, visiblePlacements } from './state'
import { ThreadsContext } from './ThreadsProvider'

function useCtx() {
  const ctx = useContext(ThreadsContext)
  if (!ctx) throw new Error('useThreads hooks must be used within <ThreadsProvider>')
  return ctx
}

export function useThreadsState() {
  return useCtx().state
}

export function useController() {
  return useCtx().controller
}

/** Low-level dispatch for components that apply optimistic updates (e.g. reply/resolve). Prefer the controller for open/close/showResolved. */
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

/**
 * Detail for a specific thread id, read from the per-id cache. Unlike {@link useOpenThread} this is
 * NOT tied to `openId`, so a surface (the sidebar detail) keeps showing its thread even when the pin
 * popover nulls `openId` on an outside interaction. The popover open-state still uses `openId`.
 */
export function useThreadDetail(id: string | null): {
  detail: Thread | null
  loading: boolean
  error: boolean
} {
  const { state } = useCtx()
  return {
    detail: id ? (state.detailById[id] ?? null) : null,
    loading: id ? Boolean(state.loadingDetail[id]) : false,
    error: id ? Boolean(state.detailError[id]) : false,
  }
}

/**
 * Server-evaluated actions + persisted external links for a thread, plus the id of any action
 * currently running on it. Read from the per-id detail cache (a {@link ThreadView}) and the
 * in-flight map; defaults are empty/null when the thread isn't loaded yet.
 */
export function useThreadActions(id: string | null): {
  actions: ThreadActionDescriptor[]
  externalLinks: ExternalLink[]
  runningActionId: string | null
} {
  const { state } = useCtx()
  const detail = id ? state.detailById[id] : undefined
  return {
    actions: detail?.actions ?? [],
    externalLinks: detail?.externalLinks ?? [],
    runningActionId: id ? (state.runningActionById[id] ?? null) : null,
  }
}

export function useFocus(): { pendingFocusId: string | null; focusedId: string | null } {
  const { state } = useCtx()
  return { pendingFocusId: state.pendingFocusId, focusedId: state.focusedId }
}
