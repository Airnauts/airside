import { describe, expect, it, vi } from 'vitest'
import type { FetchLike } from './client'
import { createApiClient } from './client'
import { ApiError } from './errors'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

describe('createApiClient', () => {
  it('sends the key header and builds the URL for createThread', async () => {
    const calls: { url: string; init?: RequestInit }[] = []
    const fakeFetch: FetchLike = async (url, init) => {
      calls.push({ url, init })
      return jsonResponse({ id: 't1', comments: [] }, 201)
    }
    const client = createApiClient({ endpoint: 'http://x/api/', key: 'k', fetch: fakeFetch })
    const body = {
      pageUrl: 'https://h/p',
      anchor: {
        schemaVersion: 1,
        selectors: ['body', 'body'],
        signals: { tag: 'body', classes: [], siblingIndex: 0, ancestorTrail: [] },
        offset: { fx: 0.5, fy: 0.5 },
      },
      comment: { text: 'hi' },
      author: { email: 'a@b.com' },
      captureContext: { viewportW: 1, viewportH: 1, devicePixelRatio: 1, userAgent: 'u' },
    } as Parameters<typeof client.createThread>[0]
    await client.createThread(body)
    expect(calls[0]?.url).toBe('http://x/api/threads') // trailing slash on endpoint normalized away
    const headers = calls[0]?.init?.headers as Record<string, string>
    expect(headers['x-airside-key']).toBe('k')
  })

  it('builds list query strings', async () => {
    const calls: string[] = []
    const fakeFetch: FetchLike = async (url) => {
      calls.push(url)
      return jsonResponse({ threads: [], nextCursor: null })
    }
    const client = createApiClient({ endpoint: 'http://x', key: 'k', fetch: fakeFetch })
    await client.listThreads({ pageKey: 'h/p', status: 'open' })
    expect(calls[0]).toBe('http://x/threads?pageKey=h%2Fp&status=open')
  })

  it('maps a non-2xx response to ApiError', async () => {
    const fakeFetch: FetchLike = async () =>
      jsonResponse({ error: { code: 'VALIDATION_FAILED', message: 'bad' } }, 400)
    const client = createApiClient({ endpoint: 'http://x', key: 'k', fetch: fakeFetch })
    const err = await client.getThread('t1').catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect(err).toMatchObject({ status: 400, code: 'VALIDATION_FAILED' })
  })

  it('maps a non-JSON error body to ApiError(UNKNOWN) instead of throwing SyntaxError', async () => {
    const fakeFetch: FetchLike = async () =>
      new Response('<html>502 Bad Gateway</html>', {
        status: 502,
        statusText: 'Bad Gateway',
        headers: { 'content-type': 'text/html' },
      })
    const client = createApiClient({ endpoint: 'http://x', key: 'k', fetch: fakeFetch })
    const err = await client.getThread('t1').catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect(err).toMatchObject({ status: 502, code: 'UNKNOWN' })
  })

  it('runThreadAction issues POST to /threads/:id/actions/:actionId and returns ThreadView', async () => {
    const calls: { url: string; init?: RequestInit }[] = []
    const threadView = { id: 't1', comments: [], actions: [] }
    const fakeFetch: FetchLike = async (url, init) => {
      calls.push({ url, init })
      return jsonResponse(threadView)
    }
    const client = createApiClient({ endpoint: 'http://x/api/', key: 'k', fetch: fakeFetch })
    const result = await client.runThreadAction('t1', 'jira.createIssue')
    expect(calls[0]?.url).toBe('http://x/api/threads/t1/actions/jira.createIssue')
    expect(calls[0]?.init?.method).toBe('POST')
    const headers = calls[0]?.init?.headers as Record<string, string>
    expect(headers['x-airside-key']).toBe('k')
    expect(result).toEqual(threadView)
  })

  describe('streamEvents', () => {
    function sseResponse(frames: string[]): Response {
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          const enc = new TextEncoder()
          for (const f of frames) controller.enqueue(enc.encode(f))
          controller.close()
        },
      })
      return new Response(stream, {
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
      })
    }

    it('opens GET /events with the key header + pageKey and decodes data frames', async () => {
      const calls: { url: string; init?: RequestInit }[] = []
      const event = {
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
      const fakeFetch: FetchLike = async (url, init) => {
        calls.push({ url, init })
        return sseResponse([': open\n\n', `data: ${JSON.stringify(event)}\n\n`])
      }
      const client = createApiClient({ endpoint: 'http://x/api', key: 'k', fetch: fakeFetch })
      const events: unknown[] = []
      const opened = await new Promise<boolean>((resolve) => {
        client.streamEvents(
          { pageKey: '/docs' },
          {
            onEvent: (e) => events.push(e),
            onOpen: () => resolve(true),
          },
        )
      })
      // Let the reader drain.
      await new Promise((r) => setTimeout(r, 0))
      expect(opened).toBe(true)
      expect(calls[0]?.url).toBe('http://x/api/events?pageKey=%2Fdocs')
      const headers = calls[0]?.init?.headers as Record<string, string>
      expect(headers['x-airside-key']).toBe('k')
      expect(events).toEqual([event])
    })

    it('calls onClose when the stream ends (server closed)', async () => {
      const fakeFetch: FetchLike = async () => sseResponse([': open\n\n'])
      const client = createApiClient({ endpoint: 'http://x', key: 'k', fetch: fakeFetch })
      const closed = await new Promise<boolean>((resolve) => {
        client.streamEvents({}, { onEvent: () => {}, onClose: () => resolve(true) })
      })
      expect(closed).toBe(true)
    })

    it('does NOT call onClose when the caller unsubscribes (abort)', async () => {
      let resolveBody: (() => void) | null = null
      const fakeFetch: FetchLike = (_url, init) =>
        new Promise((resolve, reject) => {
          // Never produce a body; reject when aborted (mirrors fetch abort semantics).
          init?.signal?.addEventListener('abort', () => reject(new Error('aborted')))
          resolveBody = () => resolve(new Response(new ReadableStream(), { status: 200 }))
        })
      const client = createApiClient({ endpoint: 'http://x', key: 'k', fetch: fakeFetch })
      const onClose = vi.fn()
      const stop = client.streamEvents({}, { onEvent: () => {}, onClose })
      stop()
      await new Promise((r) => setTimeout(r, 0))
      void resolveBody
      expect(onClose).not.toHaveBeenCalled()
    })
  })
})
