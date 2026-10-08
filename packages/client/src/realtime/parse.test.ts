import type { RealtimeEvent } from '@airnauts/airside-core'
import { describe, expect, it, vi } from 'vitest'
import { createSseParser } from './parse'

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

function frame(e: RealtimeEvent): string {
  return `data: ${JSON.stringify(e)}\n\n`
}

describe('createSseParser', () => {
  it('emits one event per complete data frame', () => {
    const onEvent = vi.fn()
    const feed = createSseParser(onEvent)
    feed(frame(event))
    expect(onEvent).toHaveBeenCalledTimes(1)
    expect(onEvent.mock.calls[0]![0]).toEqual(event)
  })

  it('reassembles an event split across chunk boundaries', () => {
    const onEvent = vi.fn()
    const feed = createSseParser(onEvent)
    const whole = frame(event)
    feed(whole.slice(0, 10))
    feed(whole.slice(10, 25))
    feed(whole.slice(25))
    expect(onEvent).toHaveBeenCalledTimes(1)
    expect(onEvent.mock.calls[0]![0]).toEqual(event)
  })

  it('handles multiple frames in one chunk', () => {
    const onEvent = vi.fn()
    const feed = createSseParser(onEvent)
    feed(frame(event) + frame({ ...event, threadId: 't2' }))
    expect(onEvent).toHaveBeenCalledTimes(2)
    expect(onEvent.mock.calls[1]![0]).toMatchObject({ threadId: 't2' })
  })

  it('ignores comment/heartbeat frames', () => {
    const onEvent = vi.fn()
    const feed = createSseParser(onEvent)
    feed(': hb\n\n')
    feed(': open\n\n')
    expect(onEvent).not.toHaveBeenCalled()
  })

  it('ignores a frame whose data is not valid JSON without throwing', () => {
    const onEvent = vi.fn()
    const feed = createSseParser(onEvent)
    expect(() => feed('data: {not json\n\n')).not.toThrow()
    expect(onEvent).not.toHaveBeenCalled()
  })
})
