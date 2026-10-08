import type { EventsQuery } from '@airnauts/airside-core'
import type { Ctx } from '../ctx'
import type { RealtimeChannel } from '../realtime/channel'
import { SSE_HEADERS, SSE_HEARTBEAT, SSE_OPEN, sseData } from '../realtime/sse'

export type StreamEventsDeps = {
  channel: RealtimeChannel
  /** Keep-alive frame interval. Default 25s. Set 0 to disable (used in tests). */
  heartbeatMs?: number
  /** Force-close after this long so a frozen connection is recycled. Default 10min. 0 = unbounded. */
  maxLifetimeMs?: number
}

const DEFAULT_HEARTBEAT_MS = 25_000
const DEFAULT_MAX_LIFETIME_MS = 600_000

/**
 * `GET /events` — subscribe to live updates over a fetch-streamed SSE response.
 * Returns the streaming `Response` directly (the router passes it through unwrapped for
 * `stream` ops). `query.pageKey` present → page-scoped subscription (pins); absent →
 * project/env all-pages subscription (the cross-page panel).
 *
 * The stream owns its cleanup: subscribing on open and tearing down the subscription +
 * timers when the client disconnects (`cancel`) or the max lifetime elapses, so a closed
 * tab never leaks a listener on the in-process bus.
 */
export function streamEvents(
  input: { ctx: Ctx; params: undefined; query: EventsQuery; body: undefined },
  deps: StreamEventsDeps,
): Response {
  const { ctx, query } = input
  const scope = { projectId: ctx.projectId, env: ctx.env }
  const pageKey = query?.pageKey ?? null
  const heartbeatMs = deps.heartbeatMs ?? DEFAULT_HEARTBEAT_MS
  const maxLifetimeMs = deps.maxLifetimeMs ?? DEFAULT_MAX_LIFETIME_MS
  const encoder = new TextEncoder()

  let unsubscribe: (() => void) | null = null
  let heartbeat: ReturnType<typeof setInterval> | null = null
  let lifetime: ReturnType<typeof setTimeout> | null = null

  function cleanup(): void {
    unsubscribe?.()
    unsubscribe = null
    if (heartbeat) clearInterval(heartbeat)
    if (lifetime) clearTimeout(lifetime)
    heartbeat = null
    lifetime = null
  }

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (chunk: string): boolean => {
        try {
          controller.enqueue(encoder.encode(chunk))
          return true
        } catch {
          // Controller already closed (client gone): stop and release resources.
          cleanup()
          return false
        }
      }
      // Prime the connection so headers flush past buffering proxies before the first event.
      send(SSE_OPEN)
      unsubscribe = deps.channel.subscribe(scope, pageKey, (event) => {
        send(sseData(event))
      })
      if (heartbeatMs > 0) {
        heartbeat = setInterval(() => send(SSE_HEARTBEAT), heartbeatMs)
      }
      if (maxLifetimeMs > 0) {
        lifetime = setTimeout(() => {
          cleanup()
          try {
            controller.close()
          } catch {
            /* already closed */
          }
        }, maxLifetimeMs)
      }
    },
    cancel() {
      cleanup()
    },
  })

  return new Response(stream, { status: 200, headers: { ...SSE_HEADERS } })
}
