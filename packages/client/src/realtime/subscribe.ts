import type { RealtimeEvent } from '@airnauts/airside-core'
import type { ApiClient } from '../api/client'

export type SubscribeOptions = {
  client: Pick<ApiClient, 'streamEvents'>
  /** Page scope: a string subscribes to one page (pins); omit for the all-pages panel stream. */
  pageKey?: string
  onEvent: (event: RealtimeEvent) => void
  /**
   * Fired on every successful (re)connect. The caller should do a full refetch here so any
   * events missed while disconnected — or between the surface's initial load and the stream
   * opening — are reconciled (ADR-0045: full-refetch-on-reconnect, per surface).
   */
  onConnect?: () => void
  /** Backoff floor / ceiling. Defaults 1s / 30s. */
  minDelayMs?: number
  maxDelayMs?: number
  // Injectable for tests.
  setTimer?: (fn: () => void, ms: number) => unknown
  clearTimer?: (handle: unknown) => void
  random?: () => number
}

/**
 * Hold a live `GET /events` subscription open across drops, reconnecting with exponential
 * backoff + jitter. One stream per scope (page or all-pages); the backoff resets on every
 * successful open. Returns an unsubscribe that stops reconnecting and aborts the live stream.
 */
export function subscribeRealtime(opts: SubscribeOptions): () => void {
  const minDelay = opts.minDelayMs ?? 1000
  const maxDelay = opts.maxDelayMs ?? 30000
  const setTimer = opts.setTimer ?? ((fn, ms) => setTimeout(fn, ms))
  const clearTimer = opts.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>))
  const random = opts.random ?? Math.random

  let stopped = false
  let attempt = 0
  let cancelStream: (() => void) | null = null
  let timer: unknown = null

  function connect(): void {
    if (stopped) return
    cancelStream = opts.client.streamEvents(
      { pageKey: opts.pageKey },
      {
        onEvent: opts.onEvent,
        onOpen: () => {
          attempt = 0
          opts.onConnect?.()
        },
        onClose: () => {
          cancelStream = null
          scheduleReconnect()
        },
      },
    )
  }

  function scheduleReconnect(): void {
    if (stopped) return
    // Exponential backoff capped at maxDelay, with jitter in [base/2, base] to avoid a
    // reconnect thundering-herd when many widgets drop at once.
    const base = Math.min(maxDelay, minDelay * 2 ** attempt)
    const delay = base / 2 + random() * (base / 2)
    attempt += 1
    timer = setTimer(() => {
      timer = null
      connect()
    }, delay)
  }

  connect()

  return () => {
    stopped = true
    if (timer !== null) clearTimer(timer)
    cancelStream?.()
  }
}
