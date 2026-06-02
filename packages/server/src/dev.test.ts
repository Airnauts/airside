import { KEY_HEADER_NAME } from '@airnauts/comments-core'
import { makeCreateThreadBody } from '@airnauts/comments-test-support'
import { describe, expect, it } from 'vitest'
import { createDevServer } from './dev'
import { InMemoryRepository } from '@airnauts/comments-adapter-memory'
import { createCommentsServer } from './server'
import type { StorageAdapter } from './storage/types'

const stubStorage: StorageAdapter = {
  async put() {
    return { url: 'https://blob.test/x', key: 'x', size: 0 }
  },
}

describe('createDevServer', () => {
  it('serves the same handler over HTTP and returns 401 on missing key', async () => {
    const server = createCommentsServer({
      secretKey: 'sk_test',
      projectId: 'proj_x',
      allowedOrigins: ['http://127.0.0.1'],
      repository: new InMemoryRepository(),
      storage: stubStorage,
    })
    const dev = createDevServer(server.handle, { port: 0 })
    const { port } = await dev.listen()
    try {
      const res = await fetch(`http://127.0.0.1:${port}/threads`, {
        headers: { origin: 'http://127.0.0.1' },
      })
      expect(res.status).toBe(401)
      const ok = await fetch(`http://127.0.0.1:${port}/threads`, {
        headers: { origin: 'http://127.0.0.1', [KEY_HEADER_NAME]: 'sk_test' },
      })
      expect(ok.status).toBe(200)
      const createBody = makeCreateThreadBody()
      const createRes = await fetch(`http://127.0.0.1:${port}/threads`, {
        method: 'POST',
        headers: {
          origin: 'http://127.0.0.1',
          [KEY_HEADER_NAME]: 'sk_test',
          'content-type': 'application/json',
        },
        body: JSON.stringify(createBody),
      })
      expect(createRes.status).toBe(201)
      const created = await createRes.json()
      expect(created.id).toBeDefined()
    } finally {
      await dev.close()
    }
  })
})
