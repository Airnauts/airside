import type { Anchor, AttachmentId, Provenance, RealtimeEvent } from '@airnauts/airside-core'
import { useCallback, useEffect, useRef, useState } from 'react'
import { createRuntime } from '../anchor/runtime'
import type { ApiClient } from '../api/client'
import { ApiError } from '../api/errors'
import { buildCaptureContext } from '../config'
import { useIdentity } from '../identity/IdentityProvider'
import { takeFocusHandoff } from '../panel/navigate'
import { usePanelController, usePanelState } from '../panel/PanelProvider'
import { PinLayer } from '../positioning/layer'
import { observeReposition } from '../positioning/lifecycle'
import { useLiveStream } from '../realtime/useLiveStream'
import {
  useController,
  useDispatch,
  useThreadsState,
  useVisiblePlacements,
} from '../threads/useThreads'
import type { ComposerSubmit } from '../ui/Composer'
import { DetachedThread } from '../ui/DetachedThread'
import { Launcher } from '../ui/Launcher'
import { useToast } from '../ui/toast'
import { DraftPopover } from './DraftPopover'
import { useFocusPin } from './useFocusPin'
import { usePlacingMode } from './usePlacingMode'

export type MarkerLayerProps = {
  client: ApiClient
  pageKey: string
  pageUrl: string
  provenance?: Provenance
  resolvePageKey?: (url: string) => string
}

export function MarkerLayer({
  client,
  pageKey,
  // pageUrl prop retained on MarkerLayerProps for the public API; createThread now
  // reads window.location.href directly so the URL is live after an SPA route change.
  provenance,
  resolvePageKey,
}: MarkerLayerProps) {
  const dispatch = useDispatch()
  const controller = useController()
  const state = useThreadsState()
  const placements = useVisiblePlacements()
  const { placing, setPlacing } = usePlacingMode(dispatch)
  const [activeKey, setActiveKey] = useState(pageKey)
  const toast = useToast()
  const { identity } = useIdentity()
  const runtime = useRef<ReturnType<typeof createRuntime> | null>(null)
  const openCount = Object.values(state.itemsById).filter((i) => i.status === 'open').length

  const panel = usePanelController()
  const panelOpen = usePanelState().open
  const pendingFocusId = state.pendingFocusId
  const placed = pendingFocusId ? Boolean(state.placementsById[pendingFocusId]) : false
  // getElement must be stable: MarkerLayer re-renders on every INGEST_PLACEMENTS (scroll/resize/
  // mutation), and useFocusPin keys its timeout on getElement — a fresh closure each render would
  // restart the lost-anchor timeout forever. runtime is a ref, so the empty-dep closure stays live.
  const getElement = useCallback(
    (id: string) => runtime.current?.placed.find((p) => p.item.id === id)?.el ?? null,
    [],
  )

  useFocusPin({
    pendingFocusId,
    focusedId: state.focusedId,
    placed,
    getElement,
    dispatch,
    toast,
  })

  // biome-ignore lint/correctness/useExhaustiveDependencies: pageKey/resolvePageKey are read only inside onRouteChange which re-keys via functional setState; the runtime is keyed on the resolved activeKey.
  useEffect(() => {
    const rt = createRuntime({
      client,
      pageKey: activeKey,
      // Lets the runtime detect an in-flight client-side route change (the URL has already moved
      // to another page) and skip rematch, so it can't orphan the leaving page's anchors against
      // the destination DOM before this runtime is re-keyed/disposed on the route change.
      currentPageKey: () => (resolvePageKey ? resolvePageKey(window.location.href) : pageKey),
      onPlacements: (next) => dispatch({ type: 'INGEST_PLACEMENTS', placements: next }),
    })
    runtime.current = rt
    // Bridge optimistic status/count changes into the runtime's cached list so its next emit
    // (reposition/rematchAll, fired by scroll/resize and the popover's own DOM mutation)
    // doesn't clobber the optimistic pin (resolved → 'open', or the reply count) until a reload.
    controller.registerRuntime({
      setStatus: (id, status) => rt.setItemStatus(id, status),
      bumpCommentCount: (id, delta) => rt.bumpCommentCount(id, delta),
    })
    void rt
      .refresh()
      .then(() => {
        const handoff = takeFocusHandoff()
        if (handoff) {
          controller.requestFocus(handoff.id)
          if (handoff.openDetail) {
            void panel.openPanel()
            panel.openDetail(handoff.id)
          }
        }
      })
      // The boot list is fire-and-forget; a failed fetch (offline, server down, or a hermetic
      // test with no backend) must degrade to "no threads yet", not surface as an unhandled
      // rejection. Swallow with a debug breadcrumb, matching the runtime's refreshAnchor catches.
      .catch((err) => {
        console.debug('[airside] initial thread load failed', err)
      })
    const stop = observeReposition({
      targets: [],
      onReposition: () => rt.reposition(),
      onMutation: () => rt.rematchAll(),
      onRouteChange: () => {
        const next = resolvePageKey ? resolvePageKey(window.location.href) : pageKey
        setActiveKey((prev) => (prev === next ? prev : next))
      },
    })
    return () => {
      stop()
      rt.dispose()
      controller.registerRuntime(null)
      runtime.current = null
    }
  }, [client, activeKey, dispatch, controller, panel])

  // Toast + clear when the open thread orphaned during a re-match.
  useEffect(() => {
    if (state.lostOpenId) {
      toast('This comment’s anchor was lost')
      dispatch({ type: 'CLEAR_LOST_OPEN' })
    }
  }, [state.lostOpenId, toast, dispatch])

  // Live updates for this page's pins (ADR-0045): a remote thread.created places its pin, a
  // comment.added appends to the open detail + bumps the count, a thread.updated flips status.
  // The author's own comment echo is suppressed (the optimistic reply path already applied it);
  // thread.created/updated are idempotent so their own-echoes are harmless.
  const onPinEvent = useCallback(
    (event: RealtimeEvent) => {
      const rt = runtime.current
      if (!rt) return
      switch (event.type) {
        case 'thread.created':
          rt.addItem(event.thread)
          break
        case 'comment.added':
          if (event.comment.author.email === identity?.email) break
          controller.ingestRemoteComment(event.threadId, event.comment)
          break
        case 'thread.updated':
          controller.patchStatus(event.threadId, event.status)
          break
      }
    },
    [controller, identity?.email],
  )
  useLiveStream({
    client,
    enabled: true,
    pageKey: activeKey,
    onEvent: onPinEvent,
    // On every (re)connect, reconcile anything missed while disconnected.
    onConnect: () => void runtime.current?.refresh(),
  })

  // Fallback / freshness: refetch when the tab regains focus or becomes visible. Closes the gap
  // when the live stream is unavailable (older host, stream down) and reconciles after a sleep.
  useEffect(() => {
    const refetch = () => {
      if (document.visibilityState !== 'hidden') void runtime.current?.refresh()
    }
    window.addEventListener('focus', refetch)
    document.addEventListener('visibilitychange', refetch)
    return () => {
      window.removeEventListener('focus', refetch)
      document.removeEventListener('visibilitychange', refetch)
    }
  }, [])

  const createThread = useCallback(
    async ({ text, attachmentIds, who }: ComposerSubmit, anchor: Anchor) => {
      try {
        const created = await client.createThread({
          pageUrl: window.location.href,
          pageKey: activeKey,
          anchor,
          comment: { text, attachmentIds: attachmentIds as AttachmentId[] },
          author: { email: who.email, name: who.name },
          captureContext: buildCaptureContext(),
          provenance,
        })
        dispatch({ type: 'CLEAR_DRAFT' })
        await runtime.current?.refresh()
        // Seed the detail cache from the create response (a full Thread with its first
        // comment) so the popover renders comments immediately. Plain OPEN only sets
        // openId and would leave detail null → "No comments yet" until a manual refetch.
        dispatch({ type: 'DETAIL_LOADED', id: created.id, thread: created })
        dispatch({ type: 'OPEN', id: created.id })
      } catch (err) {
        toast(err instanceof ApiError ? err.message : 'Failed to create comment')
      }
    },
    [client, activeKey, provenance, toast, dispatch],
  )

  return (
    <>
      <PinLayer placements={placements} client={client} />
      <DetachedThread client={client} />
      <DraftPopover client={client} onCreate={createThread} />
      <Launcher
        placing={placing}
        onTogglePlace={() => setPlacing((p) => !p)}
        openCount={openCount}
        panelOpen={panelOpen}
        onTogglePanel={() => void (panelOpen ? panel.closePanel() : panel.openPanel())}
      />
    </>
  )
}
