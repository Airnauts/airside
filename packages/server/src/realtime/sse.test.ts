import type { RealtimeEvent } from '@airnauts/airside-core'
import { describe, expect, it } from 'vitest'
import { SSE_HEADERS, SSE_HEARTBEAT, sseComment, sseData } from './sse'

const event: RealtimeEvent = {
  type: 'comment.added',
  pageKey: '/docs',
  threadId: 't1',
  comment: {
    id: 'c1',
    author: { email: 'a@b.com' },
    text: 'hi',
    attachments: [],
    createdAt: '2026-01-01T00:00:00.000Z',
  },
}

describe('sse framing', () => {
  it('encodes an event as a single data frame terminated by a blank line', () => {
    const frame = sseData(event)
    expect(frame).toBe(`data: ${JSON.stringify(event)}\n\n`)
    // The JSON round-trips back to the same event.
    expect(JSON.parse(frame.slice('data: '.length).trim())).toEqual(event)
  })

  it('encodes a comment as a colon-prefixed line', () => {
    expect(sseComment('hb')).toBe(': hb\n\n')
    expect(SSE_HEARTBEAT).toBe(': hb\n\n')
  })

  it('advertises the event-stream media type and anti-buffering headers', () => {
    expect(SSE_HEADERS['content-type']).toContain('text/event-stream')
    expect(SSE_HEADERS['cache-control']).toContain('no-cache')
    expect(SSE_HEADERS['x-accel-buffering']).toBe('no')
  })
})
