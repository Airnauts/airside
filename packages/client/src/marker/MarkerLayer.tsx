import type { Anchor, Provenance } from '@airnauts/airside-core'
import { useCallback, useEffect, useRef, useState } from 'react'
import { createRuntime } from '../anchor/runtime'
import type { ApiClient } from '../api/client'
import { takeFocusHandoff } from '../panel/navigate'
import { usePanelController, usePanelState } from '../panel/PanelProvider'
import { PinLayer } from '../positioning/layer'
import { observeReposition } from '../positioning/lifecycle'
import { getSetting, setSetting } from '../settings/store'
import { useCreateThread } from '../threads/useCreateThread'
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
  // Whether the on-page pin/highlight overlay is hidden — seeded from and persisted to the
  // shared settings store so the choice survives reloads (issue #32).
  const [pinsHidden, setPinsHidden] = useState(() => getSetting('pinsHidden'))
  const [activeKey, setActiveKey] = useState(pageKey)
  const toast = useToast()
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
      // Optimistic delete drops the pin from the retained set; rollback re-fetches the list.
      removeItem: (id) => rt.removeItem(id),
      refresh: () => rt.refresh(),
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

  // The shared create path (POST + seed detail cache + notify the open panel) lives in the hook;
  // MarkerLayer supplies the captured anchor and the pin-specific follow-up below.
  const create = useCreateThread({ client, pageKey: activeKey, provenance })

  const createThread = useCallback(
    async (submit: ComposerSubmit, anchor: Anchor) => {
      const created = await create(submit, anchor)
      if (!created) return
      dispatch({ type: 'CLEAR_DRAFT' })
      // Re-list so the runtime places the new pin; then OPEN its popover over that placement.
      await runtime.current?.refresh()
      dispatch({ type: 'OPEN', id: created.id })
    },
    [create, dispatch],
  )

  const togglePins = useCallback(() => {
    const next = !pinsHidden
    setPinsHidden(next)
    setSetting('pinsHidden', next)
    // Placing an invisible pin is incoherent, so leave place mode when hiding.
    if (next) setPlacing(false)
  }, [pinsHidden, setPlacing])

  return (
    <>
      {/* While pins are hidden, unmount the on-page overlay (pins/highlights, the pin-anchored
          popover, the detached-thread card, and the in-progress draft) rather than CSS-hiding it,
          so no stale popover state lingers. The sidebar (PanelDrawer, a sibling in app.tsx) and
          the Launcher are never gated. */}
      {!pinsHidden && (
        <>
          <PinLayer placements={placements} client={client} />
          <DetachedThread client={client} />
          <DraftPopover client={client} onCreate={createThread} />
        </>
      )}
      <Launcher
        placing={placing}
        onTogglePlace={() => setPlacing((p) => !p)}
        openCount={openCount}
        panelOpen={panelOpen}
        onTogglePanel={() => void (panelOpen ? panel.closePanel() : panel.openPanel())}
        pinsHidden={pinsHidden}
        onTogglePins={togglePins}
      />
    </>
  )
}
