import { KEY_HEADER_NAME, operations } from '@comments/core'
import { makeCreateThreadBody } from '@comments/test-support'
import { describe, expect, it } from 'vitest'
import { InMemoryRepository } from '../repository/in-memory'
import { createCommentsServer } from '../server'
import type { StorageAdapter } from '../storage/types'

const stubStorage: StorageAdapter = {
  async put() {
    return { url: 'https://blob.test/x', key: 'x', size: 0 }
  },
}

function build(overrides: Partial<Parameters<typeof createCommentsServer>[0]> = {}) {
  return createCommentsServer({
    secretKey: 'sk_test',
    projectId: 'proj_x',
    allowedOrigins: ['https://app.example.com'],
    repository: new InMemoryRepository(),
    storage: stubStorage,
    rateLimit: { writesPerMin: 1000, readsPerMin: 1000 },
    ...overrides,
  })
}

const allowedHeaders: Record<string, string> = {
  origin: 'https://app.example.com',
  [KEY_HEADER_NAME]: 'sk_test',
  'content-type': 'application/json',
}

describe('pipeline — CORS preflight', () => {
  it('204 with ACAO + max-age for allowed origin', async () => {
    const server = build()
    const res = await server.handle(
      new Request('http://x/threads', {
        method: 'OPTIONS',
        headers: {
          origin: 'https://app.example.com',
          'access-control-request-method': 'POST',
        },
      }),
    )
    expect(res.status).toBe(204)
    expect(res.headers.get('access-control-allow-origin')).toBe('https://app.example.com')
    expect(res.headers.get('access-control-max-age')).toBe('600')
  })

  it('403 with no ACAO for disallowed origin', async () => {
    const server = build()
    const res = await server.handle(
      new Request('http://x/threads', {
        method: 'OPTIONS',
        headers: {
          origin: 'https://attacker.example',
          'access-control-request-method': 'POST',
        },
      }),
    )
    expect(res.status).toBe(403)
    expect(res.headers.get('access-control-allow-origin')).toBeNull()
  })
})

describe('pipeline — security', () => {
  it('401 on missing key', async () => {
    const server = build()
    const res = await server.handle(
      new Request('http://x/threads', {
        headers: { origin: 'https://app.example.com' },
      }),
    )
    expect(res.status).toBe(401)
    expect((await res.json()).error.code).toBe('AUTH_INVALID_KEY')
  })

  it('401 on wrong key', async () => {
    const server = build()
    const res = await server.handle(
      new Request('http://x/threads', {
        headers: { origin: 'https://app.example.com', [KEY_HEADER_NAME]: 'nope' },
      }),
    )
    expect(res.status).toBe(401)
  })

  it('403 on disallowed origin even with valid key', async () => {
    const server = build()
    const res = await server.handle(
      new Request('http://x/threads', {
        headers: { origin: 'https://attacker.example', [KEY_HEADER_NAME]: 'sk_test' },
      }),
    )
    expect(res.status).toBe(403)
  })

  it('403 when Origin header is missing', async () => {
    const server = build()
    const res = await server.handle(
      new Request('http://x/threads', { headers: { [KEY_HEADER_NAME]: 'sk_test' } }),
    )
    expect(res.status).toBe(403)
  })
})

describe('pipeline — rate limit', () => {
  it('429 with Retry-After once budget is exhausted', async () => {
    const server = build({ rateLimit: { writesPerMin: 1, readsPerMin: 1 } })
    const headers = { ...allowedHeaders, 'x-forwarded-for': '1.1.1.1' }
    const a = await server.handle(new Request('http://x/threads', { headers }))
    expect(a.status).not.toBe(429)
    const b = await server.handle(new Request('http://x/threads', { headers }))
    expect(b.status).toBe(429)
    expect(b.headers.get('retry-after')).not.toBeNull()
  })
})

describe('pipeline — router', () => {
  it('404 for unknown path after auth passes', async () => {
    const server = build()
    const res = await server.handle(
      new Request('http://x/does-not-exist', { headers: allowedHeaders }),
    )
    expect(res.status).toBe(404)
  })

  it('every operation in the table has a handler (sanity guard)', () => {
    expect(() => build()).not.toThrow()
    expect(operations.length).toBeGreaterThan(0)
  })

  it('round-trips a create-thread + get-thread end to end', async () => {
    const server = build()
    const body = makeCreateThreadBody()
    const createRes = await server.handle(
      new Request('http://x/threads', {
        method: 'POST',
        headers: allowedHeaders,
        body: JSON.stringify(body),
      }),
    )
    expect(createRes.status).toBe(201)
    const created = await createRes.json()
    expect(created.id).toBeDefined()

    const getRes = await server.handle(
      new Request(`http://x/threads/${created.id}`, { headers: allowedHeaders }),
    )
    expect(getRes.status).toBe(200)
    const fetched = await getRes.json()
    expect(fetched.id).toBe(created.id)
  })
})
