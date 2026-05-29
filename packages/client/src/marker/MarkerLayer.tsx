import type { Provenance } from '@comments/core'
import { useCallback, useEffect, useRef, useState } from 'react'
import { captureElement } from '../anchor/capture'
import { createRuntime } from '../anchor/runtime'
import type { ApiClient } from '../api/client'
import { ApiError } from '../api/errors'
import { buildCaptureContext } from '../config'
import type { Identity } from '../identity/storage'
import { observeReposition } from '../positioning/lifecycle'
import { PinLayer, type Placement } from '../positioning/layer'
import { useToast } from '../ui/toast'

export type MarkerLayerProps = {
  client: ApiClient
  pageKey: string
  pageUrl: string
  identity: Identity | null
  onNeedIdentity: (resume: (identity: Identity) => void) => void
  provenance?: Provenance
}

export function MarkerLayer({ client, pageKey, pageUrl, identity, onNeedIdentity, provenance }: MarkerLayerProps) {
  const [placements, setPlacements] = useState<Placement[]>([])
  const [placing, setPlacing] = useState(false)
  const toast = useToast()
  const runtime = useRef<ReturnType<typeof createRuntime> | null>(null)

  useEffect(() => {
    const rt = createRuntime({ client, pageKey, onPlacements: setPlacements })
    runtime.current = rt
    void rt.refresh()
    const stop = observeReposition({
      targets: [],
      onReposition: () => rt.reposition(),
      onRouteChange: () => {}, // pageKey re-key handled in a later task
    })
    return () => {
      stop()
      runtime.current = null
    }
  }, [client, pageKey])

  const createAt = useCallback(
    async (el: Element, point: { x: number; y: number }, who: Identity) => {
      try {
        await client.createThread({
          pageUrl,
          pageKey,
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
    [client, pageKey, pageUrl, provenance, toast],
  )

  useEffect(() => {
    if (!placing) return
    const onClick = (e: MouseEvent) => {
      const target = e.target as Element | null
      if (!target || (target as HTMLElement).dataset?.commentsPlace !== undefined) return
      e.preventDefault()
      e.stopPropagation()
      setPlacing(false)
      const el = (document.elementFromPoint?.(e.clientX, e.clientY)) ?? target
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
  }, [placing, identity, createAt, onNeedIdentity])

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
          position: 'absolute', bottom: 16, right: 16, padding: '8px 14px',
          background: placing ? '#1e40af' : '#2563eb', color: '#fff', border: 'none',
          cursor: 'pointer', pointerEvents: 'auto',
        }}
      >
        {placing ? 'Click an element…' : '+ Comment'}
      </button>
    </>
  )
}
