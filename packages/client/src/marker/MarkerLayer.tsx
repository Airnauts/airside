import type { AttachmentId, Provenance } from '@comments/core'
import * as Popover from '@radix-ui/react-popover'
import { useCallback, useEffect, useRef, useState } from 'react'
import { captureElement, captureSelection } from '../anchor/capture'
import { createRuntime } from '../anchor/runtime'
import type { ApiClient } from '../api/client'
import { ApiError } from '../api/errors'
import { usePortalContainer } from '../app/providers'
import { buildCaptureContext } from '../config'
import type { Identity } from '../identity/storage'
import { usePanelController } from '../panel/PanelProvider'
import { takeFocusHandoff } from '../panel/navigate'
import { pinXY } from '../positioning/coords'
import { PinLayer } from '../positioning/layer'
import { observeReposition } from '../positioning/lifecycle'
import {
  useController,
  useDispatch,
  useThreadsState,
  useVisiblePlacements,
} from '../threads/useThreads'
import { initials } from '../ui/avatar'
import { Composer, type ComposerSubmit } from '../ui/Composer'
import { Launcher } from '../ui/Launcher'
import { useToast } from '../ui/toast'
import { useFocusPin } from './useFocusPin'

export type MarkerLayerProps = {
  client: ApiClient
  pageKey: string
  pageUrl: string
  identity: Identity | null
  onNeedIdentity: (resume: (identity: Identity) => void) => void
  provenance?: Provenance
  resolvePageKey?: (url: string) => string
}

export function MarkerLayer({
  client,
  pageKey,
  // pageUrl prop retained on MarkerLayerProps for the public API; createThread now
  // reads window.location.href directly so the URL is live after an SPA route change.
  identity,
  onNeedIdentity,
  provenance,
  resolvePageKey,
}: MarkerLayerProps) {
  const dispatch = useDispatch()
  const controller = useController()
  const state = useThreadsState()
  const placements = useVisiblePlacements()
  const [placing, setPlacing] = useState(false)
  const [activeKey, setActiveKey] = useState(pageKey)
  const toast = useToast()
  const container = usePortalContainer()
  const runtime = useRef<ReturnType<typeof createRuntime> | null>(null)
  const openCount = Object.values(state.itemsById).filter((i) => i.status === 'open').length

  const panel = usePanelController()
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
      onPlacements: (next) => dispatch({ type: 'INGEST_PLACEMENTS', placements: next }),
    })
    runtime.current = rt
    // Bridge optimistic status changes into the runtime's cached list so its next emit
    // (reposition/rematchAll, fired by scroll/resize and the popover's own DOM mutation)
    // doesn't clobber the resolved pin back to 'open' until a reload.
    controller.registerRuntime((id, status) => rt.setItemStatus(id, status))
    void rt.refresh().then(() => {
      const focusId = takeFocusHandoff()
      if (focusId) controller.requestFocus(focusId)
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
  }, [client, activeKey, dispatch, controller])

  // Toast + clear when the open thread orphaned during a re-match.
  useEffect(() => {
    if (state.lostOpenId) {
      toast('This comment’s anchor was lost')
      dispatch({ type: 'CLEAR_LOST_OPEN' })
    }
  }, [state.lostOpenId, toast, dispatch])

  const createThread = useCallback(
    async (
      { text, attachmentIds, who }: ComposerSubmit,
      anchor: ReturnType<typeof captureElement>,
    ) => {
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

  // Place mode: next click/selection captures an anchor and opens a DRAFT popover.
  useEffect(() => {
    if (!placing) return
    const onClick = (e: MouseEvent) => {
      const target = e.target as Element | null
      if (
        !target ||
        (target as HTMLElement).dataset?.commentsPlace !== undefined ||
        target.closest('[data-comments-overlay]')
      )
        return
      e.preventDefault()
      e.stopPropagation()
      setPlacing(false)
      const sel = window.getSelection()
      if (sel && !sel.isCollapsed && sel.rangeCount > 0) {
        const range = sel.getRangeAt(0)
        const anchor = captureSelection(range)
        const rect = range.getBoundingClientRect()
        dispatch({
          type: 'SET_DRAFT',
          draft: { anchor, point: { x: rect.left, y: rect.top }, pin: pinXY(rect, anchor.offset) },
        })
        return
      }
      const el = document.elementFromPoint?.(e.clientX, e.clientY) ?? target
      const anchor = captureElement(el, { x: e.clientX, y: e.clientY })
      const rect = el.getBoundingClientRect()
      dispatch({
        type: 'SET_DRAFT',
        draft: { anchor, point: { x: e.clientX, y: e.clientY }, pin: pinXY(rect, anchor.offset) },
      })
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPlacing(false)
    }
    document.addEventListener('click', onClick, true)
    document.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('click', onClick, true)
      document.removeEventListener('keydown', onKey, true)
    }
  }, [placing, dispatch])

  return (
    <>
      <PinLayer
        placements={placements}
        client={client}
        identity={identity}
        onNeedIdentity={onNeedIdentity}
      />
      {state.draft && (
        <div data-comments-overlay className="cmnt:absolute cmnt:inset-0 cmnt:pointer-events-none">
          {/* Radix Popover anchored at the draft pin so Radix handles flip/shift +
              collision and the composer never overflows the viewport. The Anchor IS the
              preview pin (same teardrop visual as ui/Pin.tsx), so the user sees pin + composer. */}
          <Popover.Root open onOpenChange={(o) => !o && dispatch({ type: 'CLEAR_DRAFT' })}>
            <Popover.Anchor asChild>
              <div
                data-testid="comments-draft-pin"
                aria-hidden="true"
                className="cmnt:absolute cmnt:w-[42px] cmnt:h-[42px] cmnt:-ml-[21px] cmnt:-mt-[42px] cmnt:pointer-events-none"
                style={{ transform: `translate(${state.draft.pin.x}px, ${state.draft.pin.y}px)` }}
              >
                <span
                  className="cmnt:absolute cmnt:inset-0 cmnt:border-2 cmnt:border-white cmnt:shadow-lg cmnt:bg-blue-600"
                  style={{ borderRadius: '50% 50% 50% 0', transform: 'rotate(-45deg)' }}
                />
                <span className="cmnt:absolute cmnt:top-1.5 cmnt:left-1.5 cmnt:w-[30px] cmnt:h-[30px] cmnt:rounded-full cmnt:border-2 cmnt:border-white cmnt:bg-blue-600 cmnt:text-white cmnt:text-xs cmnt:flex cmnt:items-center cmnt:justify-center cmnt:font-semibold">
                  {identity ? initials(identity) : ''}
                </span>
              </div>
            </Popover.Anchor>
            <Popover.Portal container={container ?? undefined}>
              <Popover.Content
                side="top"
                align="center"
                sideOffset={8}
                collisionPadding={8}
                onOpenAutoFocus={(e) => e.preventDefault()}
                data-testid="comments-draft"
                className="cmnt:w-80 cmnt:max-w-[calc(100vw-16px)] cmnt:bg-white cmnt:border cmnt:border-gray-200 cmnt:rounded-xl cmnt:pointer-events-auto cmnt:overflow-hidden cmnt:shadow-[0_12px_32px_rgba(0,0,0,0.18)]"
              >
                {state.draft.anchor.selection?.quote && (
                  <div className="cmnt:mx-3 cmnt:mt-2 cmnt:px-2 cmnt:py-1.5 cmnt:border-l-[3px] cmnt:border-blue-600 cmnt:bg-[#f3f6fc] cmnt:text-xs cmnt:text-gray-700 cmnt:italic">
                    “{state.draft.anchor.selection.quote}”
                  </div>
                )}
                <Composer
                  mode="newThread"
                  identity={identity}
                  onNeedIdentity={onNeedIdentity}
                  upload={client.upload}
                  autoFocus
                  onCancel={() => dispatch({ type: 'CLEAR_DRAFT' })}
                  // biome-ignore lint/style/noNonNullAssertion: draft is guarded by the enclosing `state.draft &&`; the closure reads the live draft at submit time.
                  onSubmit={(payload) => createThread(payload, state.draft!.anchor)}
                />
              </Popover.Content>
            </Popover.Portal>
          </Popover.Root>
        </div>
      )}
      <Launcher
        placing={placing}
        onTogglePlace={() => setPlacing((p) => !p)}
        showResolved={state.showResolved}
        onShowResolved={(v) => controller.setShowResolved(v)}
        openCount={openCount}
        onTogglePanel={() => void panel.openPanel()}
      />
    </>
  )
}
