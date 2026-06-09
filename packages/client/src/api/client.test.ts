import { describe, expect, it } from 'vitest'
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
    expect(headers['x-comments-key']).toBe('k')
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
    expect(headers['x-comments-key']).toBe('k')
    expect(result).toEqual(threadView)
  })
})
