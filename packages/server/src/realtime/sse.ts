import type { RealtimeEvent } from '@airnauts/airside-core'

/**
 * Server-Sent Events framing (ADR-0045). One event per `data:` line, terminated by a
 * blank line. The widget consumes these via a fetch-streamed reader (not `EventSource`,
 * which cannot set the `x-airside-key` header) with a hand-rolled parser.
 */
export function sseData(event: RealtimeEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`
}

/** An SSE comment line (`:` prefix). Ignored by clients; used to keep the connection warm. */
export function sseComment(text: string): string {
  return `: ${text}\n\n`
}

/** Periodic keep-alive frame, also defeats proxies that buffer until first bytes. */
export const SSE_HEARTBEAT = sseComment('hb')

/** Sent once on open to flush headers past buffering proxies before any event arrives. */
export const SSE_OPEN = sseComment('open')

/**
 * Streaming response headers. `text/event-stream` is the SSE media type; `no-transform`
 * + `X-Accel-Buffering: no` stop intermediaries (nginx, CDNs) from buffering the stream.
 */
export const SSE_HEADERS: Record<string, string> = {
  'content-type': 'text/event-stream; charset=utf-8',
  'cache-control': 'no-cache, no-transform',
  connection: 'keep-alive',
  'x-accel-buffering': 'no',
}
