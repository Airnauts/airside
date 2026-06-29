import type { RealtimeEvent } from '@airnauts/airside-core'
import { useEffect, useRef } from 'react'
import type { ApiClient } from '../api/client'
import { subscribeRealtime } from './subscribe'

export type UseLiveStreamOptions = {
  client: Pick<ApiClient, 'streamEvents'>
  /** Subscribe only while true (e.g. the panel subscribes only while its drawer is open). */
  enabled: boolean
  /** Page scope: a string for the page (pins); omit for the all-pages panel stream. */
  pageKey?: string
  onEvent: (event: RealtimeEvent) => void
  /** Fired on every (re)connect; do a full refetch here to reconcile missed events. */
  onConnect?: () => void
}

/**
 * Hold a live `GET /events` subscription open for a surface, reconnecting across drops
 * (ADR-0045). No-op when streaming is unavailable (`enabled` false or the client lacks
 * `streamEvents` — an older host), so the surface degrades gracefully to its refetch path.
 *
 * The subscription is recreated only when `client`, `enabled`, or `pageKey` change — the event
 * handlers are read through refs so a re-render with fresh closures does not tear the stream down.
 */
export function useLiveStream({
  client,
  enabled,
  pageKey,
  onEvent,
  onConnect,
}: UseLiveStreamOptions): void {
  const onEventRef = useRef(onEvent)
  onEventRef.current = onEvent
  const onConnectRef = useRef(onConnect)
  onConnectRef.current = onConnect

  useEffect(() => {
    if (!enabled || typeof client.streamEvents !== 'function') return
    const stop = subscribeRealtime({
      client,
      pageKey,
      onEvent: (event) => onEventRef.current(event),
      onConnect: () => onConnectRef.current?.(),
    })
    return stop
  }, [client, enabled, pageKey])
}
