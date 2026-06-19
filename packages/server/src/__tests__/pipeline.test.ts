import { InMemoryRepository } from '@airnauts/airside-adapter-memory'
import { KEY_HEADER_NAME, operations } from '@airnauts/airside-core'
import { makeAuthor, makeCreateThreadBody } from '@airnauts/airside-test-support'
import { describe, expect, it, vi } from 'vitest'
import {
  IntegrationError,
  type ServerExtension,
  type ThreadActionContext,
  type ThreadActionResult,
} from '../extensions/types'
import type { UseCaseMap } from '../router'
import { assertUseCasesCoverOperations, createAirsideServer } from '../server'
import type { StorageAdapter } from '../storage/types'

const stubStorage: StorageAdapter = {
  async put() {
    return { url: 'https://blob.test/x', key: 'x', size: 0 }
  },
}

function build(overrides: Partial<Parameters<typeof createAirsideServer>[0]> = {}) {
  return createAirsideServer({
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
    // Error responses must still carry CORS headers so the browser can read the body.
    expect(res.headers.get('access-control-allow-origin')).toBe('https://app.example.com')
    expect(res.headers.get('vary')).toBe('Origin')
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

  it('allows a missing Origin when the key is valid (same-origin GET)', async () => {
    const server = build()
    const res = await server.handle(
      new Request('http://x/threads', { headers: { [KEY_HEADER_NAME]: 'sk_test' } }),
    )
    expect(res.status).toBe(200)
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

  it('boot-time guard throws when a use-case is missing', () => {
    const incomplete = {
      // intentionally missing createThread
      listThreads: async () => ({ threads: [], nextCursor: null }),
    } as unknown as UseCaseMap
    expect(() => assertUseCasesCoverOperations(incomplete, operations)).toThrowError(
      /missing use-case for 'createThread'/,
    )
  })

  it('boot-time guard passes when every operationId has a function handler', () => {
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
    // Success responses also carry CORS headers (addCorsHeaders wraps both branches).
    expect(createRes.headers.get('access-control-allow-origin')).toBe('https://app.example.com')
    expect(createRes.headers.get('vary')).toBe('Origin')

    const getRes = await server.handle(
      new Request(`http://x/threads/${created.id}`, { headers: allowedHeaders }),
    )
    expect(getRes.status).toBe(200)
    const fetched = await getRes.json()
    expect(fetched.id).toBe(created.id)
    expect(getRes.headers.get('access-control-allow-origin')).toBe('https://app.example.com')
  })
})

describe('pipeline — thread actions (extensions)', () => {
  const externalLink = {
    provider: 'jira',
    externalId: '10001',
    key: 'PROJ-1',
    label: 'PROJ-1',
    url: 'https://jira.example.com/browse/PROJ-1',
    createdAt: '2026-06-09T00:00:00.000Z',
  }

  function makeThreadActionExtension(
    run: (ctx: ThreadActionContext) => Promise<ThreadActionResult>,
  ): ServerExtension {
    return {
      kind: 'thread-action',
      id: 'jira.createIssue',
      provider: 'jira',
      label: 'Create Jira issue',
      slot: 'thread-toolbar',
      run,
    }
  }

  async function seedThread(server: ReturnType<typeof build>): Promise<string> {
    const res = await server.handle(
      new Request('http://x/threads', {
        method: 'POST',
        headers: allowedHeaders,
        body: JSON.stringify(makeCreateThreadBody()),
      }),
    )
    expect(res.status).toBe(201)
    return (await res.json()).id
  }

  it('routes a thread action: runs the extension and persists its external link', async () => {
    const run = vi.fn().mockResolvedValue({ externalLink })
    const server = build({ extensions: [makeThreadActionExtension(run)] })
    const id = await seedThread(server)

    const res = await server.handle(
      new Request(`http://x/threads/${id}/actions/jira.createIssue`, {
        method: 'POST',
        headers: allowedHeaders,
      }),
    )

    expect(res.status).toBe(200)
    expect(run).toHaveBeenCalledTimes(1)
    const body = await res.json()
    expect(body.externalLinks).toContainEqual(externalLink)
  })

  it('502 when the action throws an IntegrationError (upstream failure)', async () => {
    const run = vi.fn().mockRejectedValue(new IntegrationError('jira down', 'jira'))
    const server = build({ extensions: [makeThreadActionExtension(run)] })
    const id = await seedThread(server)

    const res = await server.handle(
      new Request(`http://x/threads/${id}/actions/jira.createIssue`, {
        method: 'POST',
        headers: allowedHeaders,
      }),
    )

    expect(res.status).toBe(502)
    expect((await res.json()).error.code).toBe('INTEGRATION_ERROR')
  })

  it('404 for an unknown actionId', async () => {
    const run = vi.fn().mockResolvedValue({ externalLink })
    const server = build({ extensions: [makeThreadActionExtension(run)] })
    const id = await seedThread(server)

    const res = await server.handle(
      new Request(`http://x/threads/${id}/actions/jira.unknown`, {
        method: 'POST',
        headers: allowedHeaders,
      }),
    )

    expect(res.status).toBe(404)
    expect(run).not.toHaveBeenCalled()
  })

  it('409 when the action is registered but visibleWhen returns false', async () => {
    const run = vi.fn()
    const server = build({
      extensions: [{ ...makeThreadActionExtension(run), visibleWhen: () => false }],
    })
    const id = await seedThread(server)

    const res = await server.handle(
      new Request(`http://x/threads/${id}/actions/jira.createIssue`, {
        method: 'POST',
        headers: allowedHeaders,
      }),
    )

    expect(res.status).toBe(409)
    expect(run).not.toHaveBeenCalled()
    expect((await res.json()).error.code).toBe('CONFLICT')
  })
})

describe('pipeline — legacy notifiers alias', () => {
  it('wraps a Notifier.notify into a notification extension and fires it on create', async () => {
    const notify = vi.fn().mockResolvedValue(undefined)
    const server = build({ notifiers: [{ name: 'spy', notify }] })

    const res = await server.handle(
      new Request('http://x/threads', {
        method: 'POST',
        headers: allowedHeaders,
        body: JSON.stringify(makeCreateThreadBody()),
      }),
    )

    expect(res.status).toBe(201)
    expect(notify).toHaveBeenCalledTimes(1)
    expect(notify.mock.calls[0][0].type).toBe('thread.created')
  })
})

describe('pipeline — attachments (two-step upload)', () => {
  // The headers a multipart upload sends: no JSON content-type (FormData sets the boundary).
  const uploadHeaders = { origin: 'https://app.example.com', [KEY_HEADER_NAME]: 'sk_test' }

  it('uploads an image, then references its id from an image-only comment end to end', async () => {
    const server = build()

    // 1. Create a thread to reply to.
    const createRes = await server.handle(
      new Request('http://x/threads', {
        method: 'POST',
        headers: allowedHeaders,
        body: JSON.stringify(makeCreateThreadBody()),
      }),
    )
    expect(createRes.status).toBe(201)
    const thread = await createRes.json()

    // 2. Upload an image via multipart → get back an Attachment with an id.
    const fd = new FormData()
    fd.append('file', new File([new Uint8Array([1, 2, 3])], 'shot.png', { type: 'image/png' }))
    const uploadRes = await server.handle(
      new Request('http://x/uploads', { method: 'POST', headers: uploadHeaders, body: fd }),
    )
    expect(uploadRes.status).toBe(201)
    const attachment = await uploadRes.json()
    expect(attachment.id).toBeDefined()
    expect(attachment.url).toBe('https://blob.test/x')

    // 3. Post an IMAGE-ONLY reply (blank text) that references the uploaded id.
    const commentRes = await server.handle(
      new Request(`http://x/threads/${thread.id}/comments`, {
        method: 'POST',
        headers: allowedHeaders,
        body: JSON.stringify({ text: '', attachmentIds: [attachment.id], author: makeAuthor() }),
      }),
    )
    expect(commentRes.status).toBe(201)

    // 4. Fetch the thread — the reply must carry the resolved attachment, not [].
    const getRes = await server.handle(
      new Request(`http://x/threads/${thread.id}`, { headers: allowedHeaders }),
    )
    const fetched = await getRes.json()
    const reply = fetched.comments.at(-1)
    expect(reply.text).toBe('')
    expect(reply.attachments).toEqual([attachment])
  })

  it('rejects a comment that references an unknown attachment id with 400', async () => {
    const server = build()
    const createRes = await server.handle(
      new Request('http://x/threads', {
        method: 'POST',
        headers: allowedHeaders,
        body: JSON.stringify(makeCreateThreadBody()),
      }),
    )
    const thread = await createRes.json()
    const res = await server.handle(
      new Request(`http://x/threads/${thread.id}/comments`, {
        method: 'POST',
        headers: allowedHeaders,
        body: JSON.stringify({ text: 'hi', attachmentIds: ['at_ghost'], author: makeAuthor() }),
      }),
    )
    expect(res.status).toBe(400)
  })
})

describe('pipeline — GET /events stream', () => {
  it('streams text/event-stream for an authorized request', async () => {
    const server = build()
    const res = await server.handle(
      new Request('http://x/events?pageKey=/docs', { headers: allowedHeaders }),
    )
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/event-stream')
    // CORS still applies to the streamed response.
    expect(res.headers.get('access-control-allow-origin')).toBe('https://app.example.com')
    expect(res.headers.get('x-accel-buffering')).toBe('no')
    await res.body?.cancel()
  })

  it('rejects an unauthenticated stream request with 401 (secret in header, not query)', async () => {
    const server = build()
    const res = await server.handle(
      new Request('http://x/events', { headers: { origin: 'https://app.example.com' } }),
    )
    expect(res.status).toBe(401)
  })

  it('is exempt from the read rate limit (a held stream never exhausts the budget)', async () => {
    const server = build({ rateLimit: { writesPerMin: 1000, readsPerMin: 1 } })
    const first = await server.handle(
      new Request('http://x/events', { headers: allowedHeaders }),
    )
    const second = await server.handle(
      new Request('http://x/events', { headers: allowedHeaders }),
    )
    expect(first.status).toBe(200)
    expect(second.status).toBe(200)
    await first.body?.cancel()
    await second.body?.cancel()
  })
})
