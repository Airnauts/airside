import type { Provenance } from '@comments/core'
import { useEffect, useState } from 'react'
import type { ApiClient } from '../api/client'
import { ApiError } from '../api/errors'
import { buildCaptureContext } from '../config'
import type { Identity } from '../identity/storage'
import { useToast } from '../ui/toast'
import { makeStubAnchor } from './stub-anchor'

type Pin = { id: string; pending: boolean }

export type MarkerLayerProps = {
  client: ApiClient
  pageKey: string
  pageUrl: string
  identity: Identity | null
  onNeedIdentity: (resume: (identity: Identity) => void) => void
  provenance?: Provenance
}

let nextTempId = 0

export function MarkerLayer({ client, pageKey, pageUrl, identity, onNeedIdentity, provenance }: MarkerLayerProps) {
  const [pins, setPins] = useState<Pin[]>([])
  const toast = useToast()

  useEffect(() => {
    let active = true
    client
      .listThreads({ pageKey })
      .then((res) => {
        if (!active) return
        setPins((prev) => [
          ...res.threads.map((t) => ({ id: t.id, pending: false })),
          ...prev.filter((p) => p.pending),
        ])
      })
      .catch(() => {
        // Reads are non-fatal in M5; the panel/orphan UX is M6+.
      })
    return () => {
      active = false
    }
  }, [client, pageKey])

  async function place(who: Identity) {
    const tempId = `optimistic-${nextTempId++}`
    setPins((prev) => [...prev, { id: tempId, pending: true }])
    try {
      const thread = await client.createThread({
        pageUrl,
        pageKey,
        anchor: makeStubAnchor(),
        comment: { text: 'Placeholder comment' },
        author: { email: who.email, name: who.name },
        captureContext: buildCaptureContext(),
        provenance,
      })
      setPins((prev) => prev.map((p) => (p.id === tempId ? { id: thread.id, pending: false } : p)))
    } catch (err) {
      setPins((prev) => prev.filter((p) => p.id !== tempId))
      toast(err instanceof ApiError ? err.message : 'Failed to create comment')
    }
  }

  function onPlaceClick() {
    if (identity) place(identity)
    else onNeedIdentity((who) => place(who))
  }

  return (
    <>
      <div data-comments-overlay style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
        {pins.map((pin, i) => (
          <div
            key={pin.id}
            data-comments-pin
            title={pin.id}
            style={{
              position: 'absolute',
              top: 16 + i * 28,
              left: 16,
              width: 20,
              height: 20,
              borderRadius: '9999px',
              background: pin.pending ? '#9ca3af' : '#2563eb',
              pointerEvents: 'auto',
            }}
          />
        ))}
      </div>
      <button
        type="button"
        data-comments-place
        onClick={onPlaceClick}
        className="cmnt:rounded-full cmnt:shadow-lg"
        style={{
          position: 'absolute',
          bottom: 16,
          right: 16,
          padding: '8px 14px',
          background: '#2563eb',
          color: '#fff',
          border: 'none',
          cursor: 'pointer',
          pointerEvents: 'auto',
        }}
      >
        + Comment
      </button>
    </>
  )
}
