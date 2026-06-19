import type { RealtimeEvent } from '@airnauts/airside-core'

/**
 * Minimal Server-Sent Events frame parser (ADR-0045). We consume `GET /events` with a
 * fetch-streamed reader rather than native `EventSource` (which can't set the
 * `x-airside-key` header), so we hand-roll just enough of the SSE grammar:
 *
 * - frames are separated by a blank line (`\n\n`),
 * - `data:` lines within a frame are concatenated and JSON-parsed into a `RealtimeEvent`,
 * - comment lines (`:` prefix, e.g. heartbeats) and frames with no/invalid data are ignored.
 *
 * Returns a `feed(chunk)` you call with each decoded text chunk; events spanning chunk
 * boundaries are buffered until complete.
 */
export function createSseParser(onEvent: (event: RealtimeEvent) => void): (chunk: string) => void {
  let buffer = ''
  return (chunk: string) => {
    // Normalize CRLF so the blank-line delimiter is uniform regardless of the proxy.
    buffer += chunk.replace(/\r\n/g, '\n')
    let sep = buffer.indexOf('\n\n')
    while (sep !== -1) {
      const frame = buffer.slice(0, sep)
      buffer = buffer.slice(sep + 2)
      handleFrame(frame, onEvent)
      sep = buffer.indexOf('\n\n')
    }
  }
}

function handleFrame(frame: string, onEvent: (event: RealtimeEvent) => void): void {
  const data = frame
    .split('\n')
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(line.startsWith('data: ') ? 'data: '.length : 'data:'.length))
    .join('\n')
  if (data === '') return // comment-only / heartbeat / blank frame
  try {
    onEvent(JSON.parse(data) as RealtimeEvent)
  } catch {
    // Malformed or partial JSON — drop it; the server only sends well-formed events.
  }
}
