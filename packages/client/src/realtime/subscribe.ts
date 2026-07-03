import type { RealtimeEvent } from '@airnauts/airside-core'
import type { ApiClient } from '../api/client'

export type SubscribeOptions = {
  client: Pick<ApiClient, 'streamEvents'>
  /** Page scope: a string subscribes to one page (pins); omit for the all-pages panel stream. */
  pageKey?: string
  onEvent: (event: RealtimeEvent) => void
  /**
   * Fired once a (re)connect is proven healthy — after the first event arrives, or after the
   * stream has stayed open for `healthyAfterMs` (whichever comes first) — NOT on the bare
   * transport open. The caller should do a full refetch here so any events missed while
   * disconnected — or between the surface's initial load and the stream opening — are
   * reconciled (ADR-0045: full-refetch-on-reconnect, per surface). Gating on health means a
   * proxy that accepts the connection then drops the body can't trigger a refetch every cycle.
   */
  onConnect?: () => void
  /** Backoff floor / ceiling. Defaults 1s / 30s. */
  minDelayMs?: number
  maxDelayMs?: number
  /**
   * How long a stream must stay open (with no event yet) before it counts as healthy — resetting
   * the backoff and firing `onConnect`. The first event proves health immediately. Defaults to
   * `minDelayMs`. Guards against a header-only accept loop resetting backoff to the floor.
   */
  healthyAfterMs?: number
  // Injectable for tests.
  setTimer?: (fn: () => void, ms: number) => unknown
  clearTimer?: (handle: unknown) => void
  random?: () => number
}

/**
 * Hold a live `GET /events` subscription open across drops, reconnecting with exponential
 * backoff + jitter. One stream per scope (page or all-pages); the backoff resets only once a
 * connection proves healthy (first event, or staying open a minimum window) — not on the bare
 * transport open, since a proxy/LB can accept the connection then immediately drop the body,
 * which would otherwise loop forever at the backoff floor with a full refetch each cycle.
 * Returns an unsubscribe that stops reconnecting and aborts the live stream.
 */
export function subscribeRealtime(opts: SubscribeOptions): () => void {
  const minDelay = opts.minDelayMs ?? 1000
  const maxDelay = opts.maxDelayMs ?? 30000
  const healthyAfter = opts.healthyAfterMs ?? minDelay
  const setTimer = opts.setTimer ?? ((fn, ms) => setTimeout(fn, ms))
  const clearTimer = opts.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>))
  const random = opts.random ?? Math.random

  let stopped = false
  let attempt = 0
  let cancelStream: (() => void) | null = null
  let timer: unknown = null

  function connect(): void {
    if (stopped) return
    // Per-connection health latch: the backoff reset + reconcile refetch fire at most once, and
    // only after the stream has proven itself (first event, or survived the healthy window).
    let healthy = false
    let healthTimer: unknown = null
    const clearHealthTimer = () => {
      if (healthTimer !== null) {
        clearTimer(healthTimer)
        healthTimer = null
      }
    }
    const markHealthy = () => {
      if (healthy || stopped) return
      healthy = true
      clearHealthTimer()
      attempt = 0
      opts.onConnect?.()
    }
    cancelStream = opts.client.streamEvents(
      { pageKey: opts.pageKey },
      {
        onEvent: (event) => {
          // A real event is definitive proof the body is flowing — health immediately.
          markHealthy()
          opts.onEvent(event)
        },
        onOpen: () => {
          // Headers only prove the transport accepted the request, not that the body streams.
          // Arm a window; if the stream survives it, treat the connection as healthy.
          healthTimer = setTimer(markHealthy, healthyAfter)
        },
        onClose: () => {
          clearHealthTimer()
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
