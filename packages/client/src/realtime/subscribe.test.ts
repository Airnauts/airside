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

/** Capture scheduled timers so the test can run them deterministically. */
function fakeTimers() {
  const queue: { fn: () => void; ms: number }[] = []
  return {
    queue,
    setTimer: (fn: () => void, ms: number) => {
      queue.push({ fn, ms })
      return queue.length - 1
    },
    clearTimer: vi.fn(),
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

  it('fires onConnect on every (re)connect so the caller can full-refetch', () => {
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
    conns[0]!.handlers.onOpen?.()
    expect(onConnect).toHaveBeenCalledTimes(1)
    conns[0]!.handlers.onClose?.()
    timers.runNext() // reconnect
    conns[1]!.handlers.onOpen?.()
    expect(onConnect).toHaveBeenCalledTimes(2)
  })

  it('reconnects with growing backoff that resets after a successful open', () => {
    const { client, conns } = fakeClient()
    const timers = fakeTimers()
    subscribeRealtime({
      client,
      onEvent: vi.fn(),
      minDelayMs: 1000,
      maxDelayMs: 30000,
      setTimer: timers.setTimer,
      clearTimer: timers.clearTimer,
      random: () => 0, // jitter floor: delay = base/2
    })
    // First drop (attempt 0): base 1000 → delay 500.
    conns[0]!.handlers.onClose?.()
    expect(timers.queue[0]!.ms).toBe(500)
    timers.runNext()
    // Second consecutive drop without an open (attempt 1): base 2000 → delay 1000.
    conns[1]!.handlers.onClose?.()
    expect(timers.queue[0]!.ms).toBe(1000)
    timers.runNext()
    // A successful open resets the backoff; next drop is back to 500.
    conns[2]!.handlers.onOpen?.()
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
})
