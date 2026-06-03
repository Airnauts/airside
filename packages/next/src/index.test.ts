import { memoryRepository } from '@airnauts/comments-adapter-memory'
import { KEY_HEADER_NAME } from '@airnauts/comments-core'
import type { StorageAdapter } from '@airnauts/comments-server'
import { makeCreateThreadBody } from '@airnauts/comments-test-support'
import { describe, expect, it } from 'vitest'
import { createCommentsRoute } from './index'

const stubStorage: StorageAdapter = {
  async put() {
    return { url: 'https://blob.test/x', key: 'x', size: 0 }
  },
}

function build() {
  return createCommentsRoute({
    secretKey: 'sk_test',
    projectId: 'proj_x',
    allowedOrigins: ['https://app.example.com'],
    repository: memoryRepository(),
    storage: stubStorage,
    rateLimit: false,
  })
}

const headers = {
  origin: 'https://app.example.com',
  [KEY_HEADER_NAME]: 'sk_test',
  'content-type': 'application/json',
}

describe('createCommentsRoute', () => {
  it('round-trips create → get through the returned handlers', async () => {
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

    const got = await GET(new Request(`https://host/api/comments/threads/${id}`, { headers }), {
      params: Promise.resolve({ path: ['threads', id] }),
    })
    expect(got.status).toBe(200)
    expect((await got.json()).id).toBe(id)
  })

  it('also returns the underlying server', () => {
    const route = build()
    expect(typeof route.server?.handle).toBe('function')
  })

  it('404s every handler and builds no server when disabled', async () => {
    const route = createCommentsRoute({
      disabled: true,
      secretKey: 'sk_test',
      projectId: 'proj_x',
      allowedOrigins: ['https://app.example.com'],
      repository: memoryRepository(),
      storage: stubStorage,
      rateLimit: false,
    })
    expect(route.server).toBeUndefined()
    const ctx = { params: Promise.resolve({ path: ['threads'] }) }
    for (const method of ['GET', 'POST', 'PATCH', 'OPTIONS'] as const) {
      const res = await route[method](new Request('https://host/api/comments/threads'), ctx)
      expect(res.status).toBe(404)
    }
  })
})
