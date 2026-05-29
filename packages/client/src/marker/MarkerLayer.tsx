import type { AttachmentId, Provenance } from '@comments/core'
import { useCallback, useEffect, useRef, useState } from 'react'
import { captureElement, captureSelection } from '../anchor/capture'
import { createRuntime } from '../anchor/runtime'
import type { ApiClient } from '../api/client'
import { ApiError } from '../api/errors'
import { buildCaptureContext } from '../config'
import type { Identity } from '../identity/storage'
import { pinXY } from '../positioning/coords'
import { PinLayer } from '../positioning/layer'
import { observeReposition } from '../positioning/lifecycle'
import {
  useController,
  useDispatch,
  useThreadsState,
  useVisiblePlacements,
} from '../threads/useThreads'
import { Composer, type ComposerSubmit } from '../ui/Composer'
import { Launcher } from '../ui/Launcher'
import { useToast } from '../ui/toast'

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
  const runtime = useRef<ReturnType<typeof createRuntime> | null>(null)
  const openCount = Object.values(state.itemsById).filter((i) => i.status === 'open').length

  // biome-ignore lint/correctness/useExhaustiveDependencies: pageKey/resolvePageKey are read only inside onRouteChange which re-keys via functional setState; the runtime is keyed on the resolved activeKey.
  useEffect(() => {
    const rt = createRuntime({
      client,
      pageKey: activeKey,
      onPlacements: (next) => dispatch({ type: 'INGEST_PLACEMENTS', placements: next }),
    })
    runtime.current = rt
    void rt.refresh()
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
      runtime.current = null
    }
  }, [client, activeKey, dispatch])

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
          <div
            data-testid="comments-draft"
            className="cmnt:absolute cmnt:w-80 cmnt:-ml-40 cmnt:mt-3 cmnt:bg-white cmnt:border cmnt:border-gray-200 cmnt:rounded-xl cmnt:pointer-events-auto cmnt:overflow-hidden cmnt:shadow-[0_12px_32px_rgba(0,0,0,0.18)]"
            style={{ transform: `translate(${state.draft.pin.x}px, ${state.draft.pin.y}px)` }} // computed → inline
          >
            <div className="cmnt:flex cmnt:justify-between cmnt:px-3 cmnt:py-2.5 cmnt:border-b cmnt:border-[#f1f3f5]">
              <span className="cmnt:text-[11px] cmnt:font-semibold cmnt:text-gray-500">
                New comment
              </span>
              <button
                type="button"
                aria-label="Discard"
                onClick={() => dispatch({ type: 'CLEAR_DRAFT' })}
                className="cmnt:border-none cmnt:bg-transparent cmnt:cursor-pointer cmnt:text-gray-500"
              >
                ✕
              </button>
            </div>
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
              // biome-ignore lint/style/noNonNullAssertion: draft is guarded by the enclosing `state.draft &&`; the closure reads the live draft at submit time.
              onSubmit={(payload) => createThread(payload, state.draft!.anchor)}
            />
          </div>
        </div>
      )}
      <Launcher
        placing={placing}
        onTogglePlace={() => setPlacing((p) => !p)}
        showResolved={state.showResolved}
        onShowResolved={(v) => controller.setShowResolved(v)}
        openCount={openCount}
      />
    </>
  )
}
