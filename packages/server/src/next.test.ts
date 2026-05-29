import { KEY_HEADER_NAME } from '@comments/core'
import { makeCreateThreadBody } from '@comments/test-support'
import { describe, expect, it } from 'vitest'
import { createNextHandler } from './next'
import { InMemoryRepository } from './repository/in-memory'
import { createCommentsServer } from './server'
import type { StorageAdapter } from './storage/types'

const stubStorage: StorageAdapter = {
  async put() {
    return { url: 'https://blob.test/x', key: 'x', size: 0 }
  },
}

function build() {
  const server = createCommentsServer({
    secretKey: 'sk_test',
    projectId: 'proj_x',
    allowedOrigins: ['https://app.example.com'],
    repository: new InMemoryRepository(),
    storage: stubStorage,
    rateLimit: { writesPerMin: 1000, readsPerMin: 1000 },
  })
  return createNextHandler(server)
}

const headers = {
  origin: 'https://app.example.com',
  [KEY_HEADER_NAME]: 'sk_test',
  'content-type': 'application/json',
}

describe('createNextHandler', () => {
  it('maps the catch-all path and round-trips create → get', async () => {
    const { GET, POST } = build()

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
    expect(typeof id).toBe('string')

    const got = await GET(
      new Request(`https://host/api/comments/threads/${id}`, { headers }),
      { params: Promise.resolve({ path: ['threads', id] }) },
    )
    expect(got.status).toBe(200)
    expect((await got.json()).id).toBe(id)
  })

  it('carries a PATCH body through the glue (setThreadStatus)', async () => {
    const { PATCH, POST } = build()

    const created = await POST(
      new Request('https://host/api/comments/threads', {
        method: 'POST',
        headers,
        body: JSON.stringify(makeCreateThreadBody()),
      }),
      { params: Promise.resolve({ path: ['threads'] }) },
    )
    const { id } = await created.json()

    const res = await PATCH(
      new Request(`https://host/api/comments/threads/${id}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ status: 'resolved' }),
      }),
      { params: Promise.resolve({ path: ['threads', id] }) },
    )
    expect(res.status).toBe(200)
    expect((await res.json()).status).toBe('resolved')
  })

  it('handles an OPTIONS preflight through the glue', async () => {
    const { OPTIONS } = build()
    const res = await OPTIONS(
      new Request('https://host/api/comments/threads', {
        method: 'OPTIONS',
        headers: {
          origin: 'https://app.example.com',
          'access-control-request-method': 'POST',
        },
      }),
      { params: Promise.resolve({ path: ['threads'] }) },
    )
    expect(res.status).toBe(204)
    expect(res.headers.get('access-control-allow-origin')).toBe('https://app.example.com')
  })

  it('preserves the query string when mapping nested paths', async () => {
    const { GET } = build()
    const res = await GET(
      new Request('https://host/api/comments/threads?status=open&pageKey=example.com/about', {
        headers,
      }),
      { params: Promise.resolve({ path: ['threads'] }) },
    )
    expect(res.status).toBe(200)
    expect((await res.json()).threads).toEqual([])
  })

  it('accepts a synchronous params object (Next 14)', async () => {
    const { GET } = build()
    const res = await GET(new Request('https://host/api/comments/threads', { headers }), {
      params: { path: ['threads'] },
    })
    expect(res.status).toBe(200)
  })
})
