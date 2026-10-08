import type { RealtimeEvent } from '@airnauts/airside-core'
import { describe, expect, it } from 'vitest'
import { makeCtx } from '../ctx'
import { InProcessRealtimeChannel } from '../realtime/channel'
import { streamEvents } from './stream-events'

const ctx = makeCtx({ projectId: 'p1', env: 'prod' })
const scope = { projectId: 'p1', env: 'prod' }

function commentEvent(pageKey: string | null): RealtimeEvent {
  return {
    type: 'comment.added',
    pageKey,
    threadId: 't1',
    comment: {
      id: 'c1',
      author: { email: 'a@b.com' },
      text: 'hi',
      attachments: [],
      createdAt: '2026-01-01T00:00:00.000Z',
    },
  }
}

/** Read decoded chunks from a streaming Response until `predicate` is satisfied or it ends. */
async function readUntil(res: Response, predicate: (acc: string) => boolean): Promise<string> {
  const reader = res.body!.getReader()
  const decoder = new TextDecoder()
  let acc = ''
  while (!predicate(acc)) {
    const { value, done } = await reader.read()
    if (done) break
    acc += decoder.decode(value, { stream: true })
  }
  await reader.cancel()
  return acc
}

describe('streamEvents use-case', () => {
  it('returns a 200 text/event-stream response', async () => {
    const channel = new InProcessRealtimeChannel()
    const res = streamEvents({ ctx, params: undefined, query: {}, body: undefined }, { channel })
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/event-stream')
    expect(res.headers.get('x-accel-buffering')).toBe('no')
    await res.body!.cancel()
  })

  it('forwards a page-scoped event as an SSE data frame to a ?pageKey= subscriber', async () => {
    const channel = new InProcessRealtimeChannel()
    const res = streamEvents(
      { ctx, params: undefined, query: { pageKey: '/docs' }, body: undefined },
      { channel },
    )
    // Wait for the subscription to be wired before publishing.
    await Promise.resolve()
    const e = commentEvent('/docs')
    channel.publish(scope, e)
    const out = await readUntil(res, (acc) => acc.includes('data:'))
    expect(out).toContain(`data: ${JSON.stringify(e)}`)
  })

  it('forwards every page event to an all-pages (no pageKey) subscriber', async () => {
    const channel = new InProcessRealtimeChannel()
    const res = streamEvents({ ctx, params: undefined, query: {}, body: undefined }, { channel })
    await Promise.resolve()
    const e = commentEvent('/somewhere-else')
    channel.publish(scope, e)
    const out = await readUntil(res, (acc) => acc.includes('data:'))
    expect(out).toContain(`data: ${JSON.stringify(e)}`)
  })

  it('unsubscribes from the channel when the stream is cancelled', async () => {
    const channel = new InProcessRealtimeChannel()
    const res = streamEvents({ ctx, params: undefined, query: {}, body: undefined }, { channel })
    await Promise.resolve()
    expect(channel.subscriberCount(scope)).toBe(1)
    await res.body!.cancel()
    expect(channel.subscriberCount(scope)).toBe(0)
  })

  it('emits a heartbeat comment on the configured interval', async () => {
    const channel = new InProcessRealtimeChannel()
    const res = streamEvents(
      { ctx, params: undefined, query: {}, body: undefined },
      { channel, heartbeatMs: 5 },
    )
    const out = await readUntil(res, (acc) => (acc.match(/: hb/g)?.length ?? 0) >= 1)
    expect(out).toContain(': hb')
  })
})
