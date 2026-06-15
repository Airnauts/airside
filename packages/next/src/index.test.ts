import type { ServerResponse } from 'node:http'
import { Readable } from 'node:stream'
import { createMemoryRepository } from '@airnauts/comments-adapter-memory'
import { KEY_HEADER_NAME } from '@airnauts/comments-core'
import type { StorageAdapter } from '@airnauts/comments-server'
import { makeCreateThreadBody } from '@airnauts/comments-test-support'
import { describe, expect, it } from 'vitest'
import { createCommentsAppRoute, createCommentsPagesRoute } from './index'
import type { NodePagesRequest } from './pages-router'

const stubStorage: StorageAdapter = {
  async put() {
    return { url: 'https://blob.test/x', key: 'x', size: 0 }
  },
}
const headers = {
  origin: 'https://app.example.com',
  [KEY_HEADER_NAME]: 'sk_test',
  'content-type': 'application/json',
}

function baseConfig() {
  return {
    secretKey: 'sk_test',
    projectId: 'proj_x',
    allowedOrigins: ['https://app.example.com'],
    repository: createMemoryRepository(),
    storage: stubStorage,
    rateLimit: false as const,
  }
}

function fakeReq(opts: {
  method?: string
  url: string
  query: { path?: string[] | string }
  headers?: Record<string, string>
  body?: string
}): NodePagesRequest {
  const r = Readable.from(
    opts.body != null ? [Buffer.from(opts.body)] : [],
  ) as unknown as NodePagesRequest
  r.method = opts.method ?? 'GET'
  r.url = opts.url
  r.headers = { host: 'host', ...(opts.headers ?? {}) }
  r.query = opts.query
  return r
}

function fakeRes() {
  const headers: Record<string, string> = {}
  const out = {
    statusCode: 0,
    headers,
    body: undefined as Buffer | undefined,
    setHeader(k: string, v: string) {
      headers[k] = v
    },
    end(b?: Buffer) {
      out.body = b
    },
  }
  return out
}

describe('createCommentsAppRoute', () => {
  it('round-trips create → get and exposes the server', async () => {
    const { GET, POST, server } = createCommentsAppRoute(baseConfig())
    expect(typeof server?.handle).toBe('function')
    const created = await POST(
      new Request('https://host/api/comments/threads', {
        method: 'POST',
        headers,
        body: JSON.stringify(makeCreateThreadBody()),
      }),
      { params: Promise.resolve({ path: ['threads'] }) },
    )
    expect(created.status).toBe(201)
    const { id } = await created.json()
    const got = await GET(new Request(`https://host/api/comments/threads/${id}`, { headers }), {
      params: Promise.resolve({ path: ['threads', id] }),
    })
    expect(got.status).toBe(200)
    expect((await got.json()).id).toBe(id)
  })

  it('404s every handler and builds no server when disabled', async () => {
    const route = createCommentsAppRoute({ ...baseConfig(), disabled: true })
    expect(route.server).toBeUndefined()
    const ctx = { params: Promise.resolve({ path: ['threads'] }) }
    for (const m of ['GET', 'POST', 'PATCH', 'OPTIONS'] as const) {
      expect((await route[m](new Request('https://host/api/comments/threads'), ctx)).status).toBe(
        404,
      )
    }
  })
})

describe('createCommentsPagesRoute', () => {
  it('round-trips create → get and exposes the server', async () => {
    const handler = createCommentsPagesRoute(baseConfig())
    expect(typeof handler.server?.handle).toBe('function')

    const createRes = fakeRes()
    await handler(
      fakeReq({
        method: 'POST',
        url: '/api/comments/threads',
        query: { path: ['threads'] },
        headers,
        body: JSON.stringify(makeCreateThreadBody()),
      }),
      createRes as unknown as ServerResponse,
    )
    expect(createRes.statusCode).toBe(201)
    const { id } = JSON.parse(createRes.body?.toString() ?? '{}')

    const getRes = fakeRes()
    await handler(
      fakeReq({
        method: 'GET',
        url: `/api/comments/threads/${id}`,
        query: { path: ['threads', id] },
        headers,
      }),
      getRes as unknown as ServerResponse,
    )
    expect(getRes.statusCode).toBe(200)
    expect(JSON.parse(getRes.body?.toString() ?? '{}').id).toBe(id)
  })

  it('404s and builds no server when disabled', async () => {
    const handler = createCommentsPagesRoute({ ...baseConfig(), disabled: true })
    expect(handler.server).toBeUndefined()
    const res = fakeRes()
    await handler(
      fakeReq({
        method: 'GET',
        url: '/api/comments/threads',
        query: { path: ['threads'] },
        headers,
      }),
      res as unknown as ServerResponse,
    )
    expect(res.statusCode).toBe(404)
  })
})
