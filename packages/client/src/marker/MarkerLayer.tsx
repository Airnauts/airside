import type { Provenance } from '@comments/core'
import { useCallback, useEffect, useRef, useState } from 'react'
import { captureElement, captureSelection } from '../anchor/capture'
import { createRuntime } from '../anchor/runtime'
import type { ApiClient } from '../api/client'
import { ApiError } from '../api/errors'
import { buildCaptureContext } from '../config'
import type { Identity } from '../identity/storage'
import { PinLayer, type PlacedThread } from '../positioning/layer'
import { observeReposition } from '../positioning/lifecycle'
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
  pageUrl,
  identity,
  onNeedIdentity,
  provenance,
  resolvePageKey,
}: MarkerLayerProps) {
  const [placements, setPlacements] = useState<PlacedThread[]>([])
  const [placing, setPlacing] = useState(false)
  const [activeKey, setActiveKey] = useState(pageKey)
  const toast = useToast()
  const runtime = useRef<ReturnType<typeof createRuntime> | null>(null)

  // biome-ignore lint/correctness/useExhaustiveDependencies: pageKey/resolvePageKey are read only inside onRouteChange which re-keys via functional setState; resolvePageKey is a fresh arrow per parent render, so listing it would re-list on every parent re-render — the runtime is keyed on the resolved activeKey instead.
  useEffect(() => {
    const rt = createRuntime({ client, pageKey: activeKey, onPlacements: setPlacements })
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
  }, [client, activeKey])

  const createAt = useCallback(
    async (el: Element, point: { x: number; y: number }, who: Identity) => {
      try {
        await client.createThread({
          pageUrl,
          pageKey: activeKey,
          anchor: captureElement(el, point),
          comment: { text: 'Placeholder comment' }, // composer is M7
          author: { email: who.email, name: who.name },
          captureContext: buildCaptureContext(),
          provenance,
        })
        await runtime.current?.refresh()
      } catch (err) {
        toast(err instanceof ApiError ? err.message : 'Failed to create comment')
      }
    },
    [client, activeKey, pageUrl, provenance, toast],
  )

  const createSelectionThread = useCallback(
    async (range: Range, who: Identity) => {
      try {
        await client.createThread({
          pageUrl,
          pageKey: activeKey,
          anchor: captureSelection(range),
          comment: { text: 'Placeholder comment' },
          author: { email: who.email, name: who.name },
          captureContext: buildCaptureContext(),
          provenance,
        })
        await runtime.current?.refresh()
      } catch (err) {
        toast(err instanceof ApiError ? err.message : 'Failed to create comment')
      }
    },
    [client, activeKey, pageUrl, provenance, toast],
  )

  useEffect(() => {
    if (!placing) return
    const onClick = (e: MouseEvent) => {
      const target = e.target as Element | null
      if (!target || (target as HTMLElement).dataset?.commentsPlace !== undefined) return
      const sel = window.getSelection()
      if (sel && !sel.isCollapsed && sel.rangeCount > 0) {
        e.preventDefault()
        e.stopPropagation()
        setPlacing(false)
        const range = sel.getRangeAt(0)
        if (identity) void createSelectionThread(range, identity)
        else onNeedIdentity((who) => void createSelectionThread(range, who))
        return
      }
      e.preventDefault()
      e.stopPropagation()
      setPlacing(false)
      const el = document.elementFromPoint?.(e.clientX, e.clientY) ?? target
      const point = { x: e.clientX, y: e.clientY }
      if (identity) void createAt(el, point, identity)
      else onNeedIdentity((who) => void createAt(el, point, who))
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
  }, [placing, identity, createAt, createSelectionThread, onNeedIdentity])

  return (
    <>
      <PinLayer placements={placements} />
      <button
        type="button"
        data-comments-place
        data-testid="comments-place"
        onClick={() => setPlacing((p) => !p)}
        className="cmnt:rounded-full cmnt:shadow-lg"
        style={{
          position: 'absolute',
          bottom: 16,
          right: 16,
          padding: '8px 14px',
          background: placing ? '#1e40af' : '#2563eb',
          color: '#fff',
          border: 'none',
          cursor: 'pointer',
          pointerEvents: 'auto',
        }}
      >
        {placing ? 'Click an element…' : '+ Comment'}
      </button>
    </>
  )
}
