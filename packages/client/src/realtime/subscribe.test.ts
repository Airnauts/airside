import type { RealtimeEvent } from '@airnauts/airside-core'
import { describe, expect, it, vi } from 'vitest'
import type { StreamHandlers, StreamParams } from '../api/client'
import { subscribeRealtime } from './subscribe'

type Conn = { params: StreamParams; handlers: StreamHandlers; abort: () => void }

/** A fake ApiClient.streamEvents the test drives by hand (open/event/close). */
function fakeClient() {
  const conns: Conn[] = []
  const abort = vi.fn()
  return {
    conns,
    abort,
    client: {
      streamEvents(params: StreamParams, handlers: StreamHandlers) {
        const conn: Conn = { params, handlers, abort }
        conns.push(conn)
        return () => abort()
      },
    },
  }
}

type Timer = { fn: () => void; ms: number }

/**
 * Capture scheduled timers so the test can run them deterministically. `clearTimer` removes the
 * timer from the queue (mirroring real `clearTimeout`), so a cancelled health timer doesn't leak
 * into the queue and skew `runNext` ordering.
 */
function fakeTimers() {
  const queue: Timer[] = []
  return {
    queue,
    setTimer: (fn: () => void, ms: number): Timer => {
      const entry: Timer = { fn, ms }
      queue.push(entry)
      return entry
    },
    clearTimer: (h: unknown) => {
      const i = queue.indexOf(h as Timer)
      if (i !== -1) queue.splice(i, 1)
    },
    runNext: () => {
      const next = queue.shift()
      next?.fn()
    },
  }
}

const event: RealtimeEvent = {
  type: 'thread.updated',
  pageKey: '/docs',
  threadId: 't1',
  status: 'resolved',
  anchorState: 'anchored',
}

describe('subscribeRealtime', () => {
  it('opens a stream with the given pageKey and forwards events', () => {
    const { client, conns } = fakeClient()
    const onEvent = vi.fn()
    subscribeRealtime({ client, pageKey: '/docs', onEvent })
    expect(conns).toHaveLength(1)
    expect(conns[0]!.params).toEqual({ pageKey: '/docs' })
    conns[0]!.handlers.onEvent(event)
    expect(onEvent).toHaveBeenCalledWith(event)
  })

  it('fires onConnect only once the connection is proven healthy — the first event proves it', () => {
    const { client, conns } = fakeClient()
    const onConnect = vi.fn()
    const timers = fakeTimers()
    subscribeRealtime({
      client,
      onEvent: vi.fn(),
      onConnect,
      setTimer: timers.setTimer,
      clearTimer: timers.clearTimer,
      random: () => 0,
    })
    // A bare transport open (headers only) does NOT fire onConnect — it only arms the window.
    conns[0]!.handlers.onOpen?.()
    expect(onConnect).not.toHaveBeenCalled()
    // The first event proves the body is flowing → healthy → onConnect fires once.
    conns[0]!.handlers.onEvent(event)
    expect(onConnect).toHaveBeenCalledTimes(1)
    // Reconnect and prove healthy again → onConnect fires per healthy (re)connect.
    conns[0]!.handlers.onClose?.()
    timers.runNext()
    conns[1]!.handlers.onOpen?.()
    conns[1]!.handlers.onEvent(event)
    expect(onConnect).toHaveBeenCalledTimes(2)
  })

  it('proves health by surviving the healthy window even with no event', () => {
    const { client, conns } = fakeClient()
    const onConnect = vi.fn()
    const timers = fakeTimers()
    subscribeRealtime({
      client,
      onEvent: vi.fn(),
      onConnect,
      minDelayMs: 1000,
      healthyAfterMs: 1000,
      setTimer: timers.setTimer,
      clearTimer: timers.clearTimer,
      random: () => 0,
    })
    conns[0]!.handlers.onOpen?.()
    expect(timers.queue[0]!.ms).toBe(1000) // the health window
    timers.runNext() // survive the window → healthy
    expect(onConnect).toHaveBeenCalledTimes(1)
    // Backoff was reset by proving health: the next drop schedules at the floor (500).
    conns[0]!.handlers.onClose?.()
    expect(timers.queue[0]!.ms).toBe(500)
  })

  it('does NOT reset backoff or refetch on a bare header-only accept loop (the storm bug)', () => {
    const { client, conns } = fakeClient()
    const onConnect = vi.fn()
    const timers = fakeTimers()
    subscribeRealtime({
      client,
      onEvent: vi.fn(),
      onConnect,
      minDelayMs: 1000,
      maxDelayMs: 30000,
      healthyAfterMs: 1000,
      setTimer: timers.setTimer,
      clearTimer: timers.clearTimer,
      random: () => 0, // jitter floor: delay = base/2
    })
    // A proxy that accepts headers then immediately drops the body, over and over: onOpen (no
    // event, window never survived) → onClose. Backoff must keep growing and never refetch.
    conns[0]!.handlers.onOpen?.()
    conns[0]!.handlers.onClose?.()
    expect(timers.queue.map((t) => t.ms)).toEqual([500]) // attempt 0 → base 1000 → 500
    timers.runNext()
    conns[1]!.handlers.onOpen?.()
    conns[1]!.handlers.onClose?.()
    expect(timers.queue[0]!.ms).toBe(1000) // attempt 1 → base 2000 → 1000
    timers.runNext()
    conns[2]!.handlers.onOpen?.()
    conns[2]!.handlers.onClose?.()
    expect(timers.queue[0]!.ms).toBe(2000) // attempt 2 → base 4000 → 2000
    // The whole point: a header-only accept loop never triggers the reconcile refetch.
    expect(onConnect).not.toHaveBeenCalled()
  })

  it('reconnects with growing backoff that resets only after a proven-healthy open', () => {
    const { client, conns } = fakeClient()
    const timers = fakeTimers()
    subscribeRealtime({
      client,
      onEvent: vi.fn(),
      minDelayMs: 1000,
      maxDelayMs: 30000,
      healthyAfterMs: 1000,
      setTimer: timers.setTimer,
      clearTimer: timers.clearTimer,
      random: () => 0, // jitter floor: delay = base/2
    })
    // First drop (attempt 0): base 1000 → delay 500.
    conns[0]!.handlers.onClose?.()
    expect(timers.queue[0]!.ms).toBe(500)
    timers.runNext()
    // Second consecutive drop without proving healthy (attempt 1): base 2000 → delay 1000.
    conns[1]!.handlers.onClose?.()
    expect(timers.queue[0]!.ms).toBe(1000)
    timers.runNext()
    // A proven-healthy open (first event) resets the backoff; next drop is back to 500.
    conns[2]!.handlers.onOpen?.()
    conns[2]!.handlers.onEvent(event)
    conns[2]!.handlers.onClose?.()
    expect(timers.queue[0]!.ms).toBe(500)
  })

  it('stops reconnecting and aborts the live stream on unsubscribe', () => {
    const { client, conns, abort } = fakeClient()
    const timers = fakeTimers()
    const stop = subscribeRealtime({
      client,
      onEvent: vi.fn(),
      setTimer: timers.setTimer,
      clearTimer: timers.clearTimer,
      random: () => 0,
    })
    stop()
    expect(abort).toHaveBeenCalled()
    // A late close after unsubscribe must not schedule a reconnect.
    conns[0]!.handlers.onClose?.()
    expect(timers.queue).toHaveLength(0)
  })

  it('suppresses a pending health window that fires after unsubscribe', () => {
    const { client, conns } = fakeClient()
    const onConnect = vi.fn()
    const timers = fakeTimers()
    const stop = subscribeRealtime({
      client,
      onEvent: vi.fn(),
      onConnect,
      healthyAfterMs: 1000,
      setTimer: timers.setTimer,
      clearTimer: timers.clearTimer,
      random: () => 0,
    })
    conns[0]!.handlers.onOpen?.() // arms the health window
    stop()
    // Even if the window timer fires late, onConnect must not run after unsubscribe.
    timers.runNext()
    expect(onConnect).not.toHaveBeenCalled()
  })
})
