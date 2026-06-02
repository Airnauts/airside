import { ANCHOR_SCHEMA_VERSION } from '@airnauts/comments-core'
import { InMemoryRepository } from '@airnauts/comments-adapter-memory'
import { createCommentsServer, type StorageAdapter } from '@airnauts/comments-server'
import { createDevServer, type DevServerHandle } from '@airnauts/comments-server/dev'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildCaptureContext } from '../config'
import type { FetchLike } from './client'
import { createApiClient } from './client'

const KEY = 'dev-key'
const ORIGIN = 'http://localhost'

// Storage is required by the server constructor even though M5 never uploads.
const storageStub: StorageAdapter = {
  async put(blob) {
    return { url: `mem://${blob.name}`, key: blob.name, size: 0 }
  },
}

// Browsers send Origin automatically; node fetch does not, and checkOrigin rejects
// a missing Origin. Inject it here to simulate the browser.
const fetchWithOrigin: FetchLike = (input, init) =>
  fetch(input, {
    ...init,
    headers: { ...(init?.headers as Record<string, string>), Origin: ORIGIN },
  })

let dev: DevServerHandle
let endpoint: string

beforeAll(async () => {
  const server = createCommentsServer({
    secretKey: KEY,
    projectId: 'p1',
    allowedOrigins: [ORIGIN],
    repository: new InMemoryRepository(),
    storage: storageStub,
    rateLimit: false,
  })
  dev = createDevServer((req) => server.handle(req), { port: 0 })
  const { port } = await dev.listen()
  endpoint = `http://127.0.0.1:${port}`
})

afterAll(async () => {
  await dev.close()
})

describe('API client round-trip against the in-memory dev server', () => {
  it('creates a thread and reads it back', async () => {
    const client = createApiClient({ endpoint, key: KEY, fetch: fetchWithOrigin })

    const created = await client.createThread({
      pageUrl: 'https://example.com/page',
      pageKey: 'example.com/page',
      anchor: {
        schemaVersion: ANCHOR_SCHEMA_VERSION,
        selectors: ['body', 'body'],
        signals: { tag: 'body', classes: [], siblingIndex: 0, ancestorTrail: [] },
        offset: { fx: 0.5, fy: 0.5 },
      },
      comment: { text: 'hello from M5' },
      author: { email: 'reviewer@example.com' },
      captureContext: buildCaptureContext({
        innerWidth: 1024,
        innerHeight: 768,
        devicePixelRatio: 1,
        navigator: { userAgent: 'test' },
      } as unknown as Window),
    })

    expect(created.id).toBeTruthy()

    // List by the pageKey the server actually stored (robust to pageKey normalization).
    const list = await client.listThreads({ pageKey: created.pageKey ?? undefined })
    expect(list.threads.map((t) => t.id)).toContain(created.id)

    const got = await client.getThread(created.id)
    expect(got.comments[0]?.text).toBe('hello from M5')
  })

  it('rejects a bad key with a 401 ApiError', async () => {
    const client = createApiClient({ endpoint, key: 'wrong-key', fetch: fetchWithOrigin })
    await expect(client.listThreads({ pageKey: 'x' })).rejects.toMatchObject({ status: 401 })
  })
})
