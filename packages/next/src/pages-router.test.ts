import type { ServerResponse } from 'node:http'
import { Readable } from 'node:stream'
import { createMemoryRepository } from '@airnauts/comments-adapter-memory'
import { KEY_HEADER_NAME } from '@airnauts/comments-core'
import { createCommentsServer, type StorageAdapter } from '@airnauts/comments-server'
import { makeCreateThreadBody } from '@airnauts/comments-test-support'
import { describe, expect, it } from 'vitest'
import { createNextPagesHandler, type NodePagesRequest } from './pages-router'

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

function build() {
  return createNextPagesHandler(
    createCommentsServer({
      secretKey: 'sk_test',
      projectId: 'proj_x',
      allowedOrigins: ['https://app.example.com'],
      repository: createMemoryRepository(),
      storage: stubStorage,
      rateLimit: { writesPerMin: 1000, readsPerMin: 1000 },
    }),
  )
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

describe('createNextPagesHandler', () => {
  it('round-trips create → get, stripping the mount prefix', async () => {
    const handler = build()

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
    expect(typeof id).toBe('string')

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

  it('throws if the body was already parsed (bodyParser left on)', async () => {
    const handler = build()
    const req = fakeReq({
      method: 'POST',
      url: '/api/comments/threads',
      query: { path: ['threads'] },
      headers,
    })
    req.body = { parsed: true }
    await expect(handler(req, fakeRes() as unknown as ServerResponse)).rejects.toThrow(
      /bodyParser: false/,
    )
  })

  it('answers an OPTIONS preflight', async () => {
    const handler = build()
    const res = fakeRes()
    await handler(
      fakeReq({
        method: 'OPTIONS',
        url: '/api/comments/threads',
        query: { path: ['threads'] },
        headers: { origin: 'https://app.example.com', 'access-control-request-method': 'POST' },
      }),
      res as unknown as ServerResponse,
    )
    expect(res.statusCode).toBe(204)
    expect(res.headers['access-control-allow-origin']).toBe('https://app.example.com')
  })
})
