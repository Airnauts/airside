# Next.js Pages Router handler + relocated unified Next exports — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a first-class Next.js Pages Router handler and relocate all Next.js coupling from `@airnauts/comments-server` into `@airnauts/comments-next`, leaving the server framework-agnostic with a generic Node↔Web bridge.

**Architecture:** `@airnauts/comments-server` exposes the Web-standard `server.handle(Request)` plus a new public `@airnauts/comments-server/node` bridge (`nodeRequestToWeb`, `webToNode`), consumed internally by `dev.ts`. `@airnauts/comments-next` owns the Next glue: a pure `operationUrl` helper, the relocated App Router handler (`createNextHandler`), the new Pages Router handler (`createNextPagesHandler`), and two public config wrappers `createCommentsAppRoute` / `createCommentsPagesRoute` (the old `createCommentsRoute` is renamed away — no shim). Recorded as ADR-0036, superseding the placement in ADR-0015 and the name in ADR-0022.

**Tech Stack:** TypeScript (ESM), pnpm workspaces, tsup + `tsc --build --force`, Turborepo, Vitest, Biome, Changesets. Node `node:http` / `node:stream` for the bridge.

**Spec:** `docs/superpowers/specs/2026-06-15-next-pages-router-and-unified-exports-design.md`

---

## Conventions (read once before starting)

- **Build order matters across packages.** `@airnauts/comments-next` imports the **built** server (`dist/`), not its source. After any change to `@airnauts/comments-server`, rebuild it before running `comments-next` tests/typecheck:
  `pnpm --filter @airnauts/comments-server build`
  Pure-function tests that import nothing from `@airnauts/comments-server` (e.g. `operation-url.test.ts`) do not need this.
- **Single-file test runs** during TDD: `pnpm --filter <pkg> exec vitest run <relative-path>`.
- **Whole-package test run:** `pnpm --filter <pkg> test`.
- **Commit footer** on every commit:
  ```
  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
  ```
- Phases A → B → C → D are ordered. Within Phase C the repo is briefly red (old `./next` import sites break the moment Phase A removes the subpath); that is expected and resolved by the end of Phase C. Do not run the full-repo gate until Task 13.

---

## File structure

**`@airnauts/comments-server`**
- Create `packages/server/src/node.ts` — generic Node↔Web bridge: `readBody`, `nodeRequestToWeb`, `webToNode`.
- Create `packages/server/src/node.test.ts` — bridge unit tests.
- Modify `packages/server/src/dev.ts` — import the bridge from `./node`; delete its private copies.
- Delete `packages/server/src/next.ts` and `packages/server/src/next.test.ts`.
- Modify `packages/server/package.json` — exports: drop `./next`, add `./node`; trim Next from description/keywords.
- Modify `packages/server/tsup.config.ts` — entry: drop `next`, add `node`.

**`@airnauts/comments-next`**
- Create `packages/next/src/operation-url.ts` — pure `operationUrl(segments, search, origin)`.
- Create `packages/next/src/operation-url.test.ts`.
- Create `packages/next/src/app-router.ts` — `createNextHandler(server)` (relocated, uses `operationUrl`).
- Create `packages/next/src/app-router.test.ts` (relocated server `next.test.ts`).
- Create `packages/next/src/pages-router.ts` — `createNextPagesHandler(server)` + `NodePagesHandler` / `NodePagesRequest` types.
- Create `packages/next/src/pages-router.test.ts`.
- Modify `packages/next/src/index.ts` — re-export the handlers; add `createCommentsAppRoute` + `createCommentsPagesRoute`.
- Modify `packages/next/src/index.test.ts` — wrapper tests (rename + Pages additions).

**Repo-wide**
- Modify `examples/nextjs-host/app/api/comments/[...path]/route.ts`, `packages/adapter-mongo/src/integration.test.ts`, `packages/adapter-mongo/package.json`, `scripts/check-exports.mjs`.
- Docs: `README.md`, `docs/integration.md`, `packages/next/README.md`, `packages/server/README.md`, `docs/architecture.md`, `docs/adr.md`.
- `.changeset/<name>.md`.

---

## Phase A — `comments-server`: extract the Node bridge, remove Next

### Task 1: Generic Node↔Web bridge (`node.ts`)

**Files:**
- Create: `packages/server/src/node.ts`
- Test: `packages/server/src/node.test.ts`

- [ ] **Step 1: Write the failing test**

`packages/server/src/node.test.ts`:
```ts
import type { ServerResponse } from 'node:http'
import { Readable } from 'node:stream'
import { describe, expect, it } from 'vitest'
import { type NodeRequestLike, nodeRequestToWeb, readBody, webToNode } from './node'

function fakeReq(opts: {
  method?: string
  headers?: Record<string, string>
  body?: string
}): NodeRequestLike {
  const r = Readable.from(opts.body != null ? [Buffer.from(opts.body)] : []) as unknown as NodeRequestLike
  r.method = opts.method ?? 'GET'
  r.headers = opts.headers ?? {}
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

describe('nodeRequestToWeb', () => {
  it('builds a Request at the given url and copies headers', async () => {
    const out = await nodeRequestToWeb(fakeReq({ headers: { 'x-test': 'y' } }), new URL('http://h/threads?status=open'))
    expect(out.url).toBe('http://h/threads?status=open')
    expect(out.headers.get('x-test')).toBe('y')
    expect(out.method).toBe('GET')
  })

  it('streams a POST body through', async () => {
    const out = await nodeRequestToWeb(
      fakeReq({ method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"a":1}' }),
      new URL('http://h/threads'),
    )
    expect(await out.json()).toEqual({ a: 1 })
  })

  it('omits the body for GET', async () => {
    const out = await nodeRequestToWeb(fakeReq({ method: 'GET' }), new URL('http://h/threads'))
    expect(out.body).toBeNull()
  })
})

describe('readBody', () => {
  it('returns undefined for HEAD', async () => {
    expect(await readBody(fakeReq({ method: 'HEAD' }))).toBeUndefined()
  })
})

describe('webToNode', () => {
  it('writes status, headers, and body to the node response', async () => {
    const res = fakeRes()
    await webToNode(new Response('hello', { status: 201, headers: { 'content-type': 'text/plain' } }), res as unknown as ServerResponse)
    expect(res.statusCode).toBe(201)
    expect(res.headers['content-type']).toContain('text/plain')
    expect(res.body?.toString()).toBe('hello')
  })

  it('ends with no body for an empty response', async () => {
    const res = fakeRes()
    await webToNode(new Response(null, { status: 204 }), res as unknown as ServerResponse)
    expect(res.statusCode).toBe(204)
    expect(res.body).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @airnauts/comments-server exec vitest run src/node.test.ts`
Expected: FAIL — `Cannot find module './node'` / `nodeRequestToWeb is not a function`.

- [ ] **Step 3: Write the implementation**

`packages/server/src/node.ts`:
```ts
import type { IncomingMessage, ServerResponse } from 'node:http'

/**
 * The slice of a Node request this bridge reads. `IncomingMessage` satisfies it;
 * so do framework wrappers like Next's `NextApiRequest`.
 */
export type NodeRequestLike = Pick<IncomingMessage, 'method' | 'headers' | 'on'>

/** Read the full request body, or `undefined` for bodiless methods. */
export function readBody(req: NodeRequestLike): Promise<Uint8Array | undefined> {
  if (req.method === 'GET' || req.method === 'HEAD') return Promise.resolve(undefined)
  return new Promise((resolve, reject) => {
    const chunks: Uint8Array[] = []
    req.on('data', (chunk: Buffer) => chunks.push(chunk))
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

/**
 * Bridge a Node request to a Web `Request` at the **given** url. The caller owns
 * URL construction because it is mount-context-specific: the dev server mounts at
 * root and uses `req.url`; a Next catch-all strips its mount prefix first.
 */
export async function nodeRequestToWeb(req: NodeRequestLike, url: URL): Promise<Request> {
  const headers = new Headers()
  for (const [k, v] of Object.entries(req.headers)) {
    if (Array.isArray(v)) headers.set(k, v.join(', '))
    else if (typeof v === 'string') headers.set(k, v)
  }
  const body = await readBody(req)
  return new Request(url, {
    method: req.method ?? 'GET',
    headers,
    body: body && body.byteLength > 0 ? body : undefined,
  })
}

/** Write a Web `Response` back onto a Node `ServerResponse`. */
export async function webToNode(res: Response, nodeRes: ServerResponse): Promise<void> {
  nodeRes.statusCode = res.status
  res.headers.forEach((value, key) => {
    nodeRes.setHeader(key, value)
  })
  if (!res.body) {
    nodeRes.end()
    return
  }
  const buf = Buffer.from(await res.arrayBuffer())
  nodeRes.end(buf)
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @airnauts/comments-server exec vitest run src/node.test.ts`
Expected: PASS (all 7 cases).

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/node.ts packages/server/src/node.test.ts
git commit -m "feat(server): add generic Node<->Web bridge module

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Refactor `dev.ts` onto the shared bridge

**Files:**
- Modify: `packages/server/src/dev.ts`

- [ ] **Step 1: Replace the private bridge with the shared one**

Rewrite `packages/server/src/dev.ts` to:
```ts
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { nodeRequestToWeb, webToNode } from './node'

export type DevServerHandle = {
  listen: () => Promise<{ port: number }>
  close: () => Promise<void>
}

type WebHandler = (req: Request) => Promise<Response>

export function createDevServer(handler: WebHandler, opts: { port?: number } = {}): DevServerHandle {
  let server: Server | null = null
  return {
    async listen() {
      const httpServer = createServer(async (req, res) => {
        try {
          // The dev server mounts at root, so req.url is already operation-relative.
          const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`)
          const webRes = await handler(await nodeRequestToWeb(req, url))
          await webToNode(webRes, res)
        } catch (_err) {
          res.statusCode = 500
          res.setHeader('content-type', 'application/json; charset=utf-8')
          res.end(JSON.stringify({ error: { code: 'INTERNAL', message: 'dev-server-error' } }))
        }
      })
      server = httpServer
      return new Promise<{ port: number }>((resolve, reject) => {
        httpServer.on('error', reject)
        httpServer.listen(opts.port ?? 4321, '127.0.0.1', () => {
          resolve({ port: (httpServer.address() as AddressInfo).port })
        })
      })
    },
    async close() {
      const httpServer = server
      if (!httpServer) return
      await new Promise<void>((resolve, reject) => {
        httpServer.close((err) => (err ? reject(err) : resolve()))
      })
      server = null
    },
  }
}
```

- [ ] **Step 2: Run the server suite to confirm nothing broke**

Run: `pnpm --filter @airnauts/comments-server test`
Expected: PASS — all existing server tests (including `next.test.ts`, still present) plus `node.test.ts`.

- [ ] **Step 3: Commit**

```bash
git add packages/server/src/dev.ts
git commit -m "refactor(server): build the dev server on the shared Node bridge

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Remove the Next subpath from `comments-server`

**Files:**
- Delete: `packages/server/src/next.ts`, `packages/server/src/next.test.ts`
- Modify: `packages/server/package.json`, `packages/server/tsup.config.ts`, `scripts/check-exports.mjs`

- [ ] **Step 1: Delete the relocated files**

```bash
git rm packages/server/src/next.ts packages/server/src/next.test.ts
```
(The handler and its tests are recreated in `comments-next` in Phase B — they are not lost.)

- [ ] **Step 2: Update the tsup entry**

In `packages/server/tsup.config.ts`, change the `entry` line:
```ts
  entry: { index: 'src/index.ts', dev: 'src/dev.ts', node: 'src/node.ts' },
```

- [ ] **Step 3: Update the package exports + metadata**

In `packages/server/package.json`:
- Remove the `"./next": { ... }` block from `exports`.
- Add under `exports` (alongside `./dev`):
  ```json
  "./node": {
    "types": "./dist/node.d.ts",
    "import": "./dist/node.js"
  }
  ```
- In `description`, replace `framework adapters (dev server, Next.js)` with `framework adapters (dev server, generic Node bridge)`.
- In `keywords`, remove `"next"` and `"nextjs"`.

- [ ] **Step 4: Update the export-resolution check**

In `scripts/check-exports.mjs`, in the `entries` array:
- Replace `['@airnauts/comments-server/next', 'createNextHandler'],` with `['@airnauts/comments-server/node', 'nodeRequestToWeb'],`.

- [ ] **Step 5: Build the server and verify the new export resolves**

Run:
```bash
pnpm --filter @airnauts/comments-server build && node -e "import('@airnauts/comments-server/node').then(m => { if (typeof m.nodeRequestToWeb !== 'function') throw new Error('missing'); console.log('node bridge OK') })"
```
Expected: prints `node bridge OK`. (`@airnauts/comments-server/next` now 404s on import — expected; its consumers are migrated in Phase B/C.)

- [ ] **Step 6: Commit**

```bash
git add packages/server/package.json packages/server/tsup.config.ts scripts/check-exports.mjs
git commit -m "feat(server)!: replace ./next subpath with a generic ./node bridge

BREAKING CHANGE: @airnauts/comments-server/next (createNextHandler) is removed;
the Next handlers move to @airnauts/comments-next. The new
@airnauts/comments-server/node exports nodeRequestToWeb/webToNode.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Phase B — `comments-next`: operationUrl, relocated App handler, Pages handler, wrappers

> Server is built (Task 3 Step 5). Rebuild it if you change it again before running these tests.

### Task 4: Pure `operationUrl` helper

**Files:**
- Create: `packages/next/src/operation-url.ts`
- Test: `packages/next/src/operation-url.test.ts`

- [ ] **Step 1: Write the failing test**

`packages/next/src/operation-url.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { operationUrl } from './operation-url'

describe('operationUrl', () => {
  it('joins array segments under the origin', () => {
    expect(operationUrl(['threads', 'abc'], '', 'http://h').href).toBe('http://h/threads/abc')
  })
  it('wraps a single string segment', () => {
    expect(operationUrl('threads', '', 'http://h').href).toBe('http://h/threads')
  })
  it('maps empty/undefined segments to root', () => {
    expect(operationUrl(undefined, '', 'http://h').href).toBe('http://h/')
    expect(operationUrl([], '', 'http://h').href).toBe('http://h/')
  })
  it('preserves the search string', () => {
    expect(operationUrl(['threads'], '?status=open', 'http://h').href).toBe('http://h/threads?status=open')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @airnauts/comments-next exec vitest run src/operation-url.test.ts`
Expected: FAIL — `Cannot find module './operation-url'`.

- [ ] **Step 3: Write the implementation**

`packages/next/src/operation-url.ts`:
```ts
/**
 * Rebuild the mount-stripped, operation-relative URL a mounted server expects,
 * from a catch-all route's segments plus the original query string. The server
 * core is mount-unaware (no basePath), so `segments` must be the bits AFTER the
 * mount — Next's `params.path` (App Router) or `req.query.path` (Pages Router).
 */
export function operationUrl(segments: string[] | string | undefined, search: string, origin: string): URL {
  const list = Array.isArray(segments) ? segments : segments ? [segments] : []
  return new URL(`/${list.join('/')}${search}`, origin)
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @airnauts/comments-next exec vitest run src/operation-url.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/next/src/operation-url.ts packages/next/src/operation-url.test.ts
git commit -m "feat(next): add pure operationUrl helper for mount-stripping

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Relocate the App Router handler (`createNextHandler`)

**Files:**
- Create: `packages/next/src/app-router.ts`
- Test: `packages/next/src/app-router.test.ts`

- [ ] **Step 1: Write the failing test**

`packages/next/src/app-router.test.ts`:
```ts
import { memoryRepository } from '@airnauts/comments-adapter-memory'
import { KEY_HEADER_NAME } from '@airnauts/comments-core'
import { createCommentsServer, type StorageAdapter } from '@airnauts/comments-server'
import { makeCreateThreadBody } from '@airnauts/comments-test-support'
import { describe, expect, it } from 'vitest'
import { createNextHandler } from './app-router'

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
    repository: memoryRepository(),
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

    const got = await GET(new Request(`https://host/api/comments/threads/${id}`, { headers }), {
      params: Promise.resolve({ path: ['threads', id] }),
    })
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
        headers: { origin: 'https://app.example.com', 'access-control-request-method': 'POST' },
      }),
      { params: Promise.resolve({ path: ['threads'] }) },
    )
    expect(res.status).toBe(204)
    expect(res.headers.get('access-control-allow-origin')).toBe('https://app.example.com')
  })

  it('preserves the query string when mapping nested paths', async () => {
    const { GET } = build()
    const res = await GET(
      new Request('https://host/api/comments/threads?status=open&pageKey=example.com/about', { headers }),
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @airnauts/comments-next exec vitest run src/app-router.test.ts`
Expected: FAIL — `Cannot find module './app-router'`.

- [ ] **Step 3: Write the implementation**

`packages/next/src/app-router.ts`:
```ts
import type { CommentsServer } from '@airnauts/comments-server'
import { operationUrl } from './operation-url'

/**
 * Next App Router catch-all context. Typed as a Promise to satisfy Next 15's
 * route-handler type validation; the handler still `await`s `params`, so a
 * synchronous Next 14 params object works at runtime.
 */
type NextRouteContext = { params: Promise<{ path?: string[] }> }
type NextHandler = (req: Request, ctx: NextRouteContext) => Promise<Response>

/**
 * App Router glue for `app/api/comments/[...path]/route.ts`:
 *   export const { GET, POST, PATCH, OPTIONS } = createNextHandler(server)
 *
 * Next strips the mount prefix and hands us the remaining segments in
 * `params.path`; we rebuild the operation-relative URL the dispatcher expects,
 * so the server core stays unaware of where it is mounted (no basePath).
 */
export function createNextHandler(server: CommentsServer): {
  GET: NextHandler
  POST: NextHandler
  PATCH: NextHandler
  OPTIONS: NextHandler
} {
  const handler: NextHandler = async (req, ctx) => {
    const { path } = await ctx.params // awaiting a non-Promise is a no-op (Next 14 safe)
    const url = new URL(req.url)
    const mapped = operationUrl(path, url.search, url.origin)
    return server.handle(new Request(mapped, req)) // copies method/headers/body
  }
  return { GET: handler, POST: handler, PATCH: handler, OPTIONS: handler }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @airnauts/comments-next exec vitest run src/app-router.test.ts`
Expected: PASS (5 cases). If you see a module-resolution error for `@airnauts/comments-server`, rebuild it first: `pnpm --filter @airnauts/comments-server build`.

- [ ] **Step 5: Commit**

```bash
git add packages/next/src/app-router.ts packages/next/src/app-router.test.ts
git commit -m "feat(next): relocate App Router handler into comments-next

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Pages Router handler (`createNextPagesHandler`)

**Files:**
- Create: `packages/next/src/pages-router.ts`
- Test: `packages/next/src/pages-router.test.ts`

- [ ] **Step 1: Write the failing test**

`packages/next/src/pages-router.test.ts`:
```ts
import type { ServerResponse } from 'node:http'
import { Readable } from 'node:stream'
import { memoryRepository } from '@airnauts/comments-adapter-memory'
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
      repository: memoryRepository(),
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
  const r = Readable.from(opts.body != null ? [Buffer.from(opts.body)] : []) as unknown as NodePagesRequest
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
      fakeReq({ method: 'GET', url: `/api/comments/threads/${id}`, query: { path: ['threads', id] }, headers }),
      getRes as unknown as ServerResponse,
    )
    expect(getRes.statusCode).toBe(200)
    expect(JSON.parse(getRes.body?.toString() ?? '{}').id).toBe(id)
  })

  it('throws if the body was already parsed (bodyParser left on)', async () => {
    const handler = build()
    const req = fakeReq({ method: 'POST', url: '/api/comments/threads', query: { path: ['threads'] }, headers })
    req.body = { parsed: true }
    await expect(handler(req, fakeRes() as unknown as ServerResponse)).rejects.toThrow(/bodyParser: false/)
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @airnauts/comments-next exec vitest run src/pages-router.test.ts`
Expected: FAIL — `Cannot find module './pages-router'`.

- [ ] **Step 3: Write the implementation**

`packages/next/src/pages-router.ts`:
```ts
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { CommentsServer } from '@airnauts/comments-server'
import { nodeRequestToWeb, webToNode } from '@airnauts/comments-server/node'
import { operationUrl } from './operation-url'

/**
 * The Node API-route request shape this handler reads. `IncomingMessage` plus the
 * catch-all `query` and the optional parsed `body`. Next's `NextApiRequest` is
 * structurally assignable, so no `next` dependency is needed.
 */
export type NodePagesRequest = IncomingMessage & {
  query?: { path?: string[] | string }
  body?: unknown
}
export type NodePagesHandler = (req: NodePagesRequest, res: ServerResponse) => Promise<void>

/**
 * Pages Router glue for `pages/api/comments/[...path].ts`:
 *   export const config = { api: { bodyParser: false } }
 *   export default createNextPagesHandler(server)
 *
 * `config.api.bodyParser` MUST be false: Next reads it statically from the route
 * module, so the helper cannot set it, and the comments API parses the raw body
 * itself. The guard below fails loud if it is left on.
 */
export function createNextPagesHandler(server: CommentsServer): NodePagesHandler {
  return async (req, res) => {
    if (req.body !== undefined) {
      throw new Error(
        "@airnauts/comments-next: Next's body parser consumed the request body. Add " +
          '`export const config = { api: { bodyParser: false } }` to the route module.',
      )
    }
    const host = req.headers.host ?? 'localhost'
    const search = req.url?.includes('?') ? req.url.slice(req.url.indexOf('?')) : ''
    const url = operationUrl(req.query?.path, search, `http://${host}`)
    const webRes = await server.handle(await nodeRequestToWeb(req, url))
    await webToNode(webRes, res)
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @airnauts/comments-next exec vitest run src/pages-router.test.ts`
Expected: PASS (3 cases).

- [ ] **Step 5: Commit**

```bash
git add packages/next/src/pages-router.ts packages/next/src/pages-router.test.ts
git commit -m "feat(next): add Pages Router handler with bodyParser guard

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Public config wrappers (`createCommentsAppRoute` / `createCommentsPagesRoute`)

**Files:**
- Modify: `packages/next/src/index.ts`
- Test: `packages/next/src/index.test.ts`

- [ ] **Step 1: Replace the test file**

Replace the entire contents of `packages/next/src/index.test.ts` with:
```ts
import type { ServerResponse } from 'node:http'
import { Readable } from 'node:stream'
import { memoryRepository } from '@airnauts/comments-adapter-memory'
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
    repository: memoryRepository(),
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
  const r = Readable.from(opts.body != null ? [Buffer.from(opts.body)] : []) as unknown as NodePagesRequest
  r.method = opts.method ?? 'GET'
  r.url = opts.url
  r.headers = { host: 'host', ...(opts.headers ?? {}) }
  r.query = opts.query
  return r
}

function fakeRes() {
  const h: Record<string, string> = {}
  const out = {
    statusCode: 0,
    headers: h,
    body: undefined as Buffer | undefined,
    setHeader(k: string, v: string) {
      h[k] = v
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
      expect((await route[m](new Request('https://host/api/comments/threads'), ctx)).status).toBe(404)
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
      fakeReq({ method: 'GET', url: `/api/comments/threads/${id}`, query: { path: ['threads', id] }, headers }),
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
      fakeReq({ method: 'GET', url: '/api/comments/threads', query: { path: ['threads'] }, headers }),
      res as unknown as ServerResponse,
    )
    expect(res.statusCode).toBe(404)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @airnauts/comments-next exec vitest run src/index.test.ts`
Expected: FAIL — `index.ts` does not export `createCommentsAppRoute` / `createCommentsPagesRoute`.

- [ ] **Step 3: Write the implementation**

Replace the entire contents of `packages/next/src/index.ts` with:
```ts
import type { CommentsServer, CreateCommentsServerOptions } from '@airnauts/comments-server'
import { createCommentsServer } from '@airnauts/comments-server'
import { createNextHandler } from './app-router'
import { createNextPagesHandler, type NodePagesHandler } from './pages-router'

export { createNextHandler } from './app-router'
export { createNextPagesHandler } from './pages-router'
export type { NodePagesHandler, NodePagesRequest } from './pages-router'

type AppRouteHandlers = ReturnType<typeof createNextHandler>

/**
 * Build the commenting server and its Next **App Router** catch-all handlers in
 * one call. Mount as `app/api/comments/[...path]/route.ts`:
 *
 *   export const { GET, POST, PATCH, OPTIONS } = createCommentsAppRoute(config)
 *
 * Also returns `server` (absent when `disabled`) for server-side reads, extra
 * routes, or server access in tests.
 */
export function createCommentsAppRoute(
  config: CreateCommentsServerOptions & { disabled?: boolean },
): AppRouteHandlers & { server?: CommentsServer } {
  if (config.disabled) {
    const notFound = async () => new Response('Not Found', { status: 404 })
    return { GET: notFound, POST: notFound, PATCH: notFound, OPTIONS: notFound }
  }
  const server = createCommentsServer(config)
  return { ...createNextHandler(server), server }
}

/**
 * Build the commenting server and a single Next **Pages Router** API-route
 * handler. Mount as `pages/api/comments/[...path].ts`:
 *
 *   export const config = { api: { bodyParser: false } } // required — Next reads it statically
 *   export default createCommentsPagesRoute(config)
 *
 * The returned function carries `.server` (absent when `disabled`) for the same
 * uses as the App Router variant.
 */
export function createCommentsPagesRoute(
  config: CreateCommentsServerOptions & { disabled?: boolean },
): NodePagesHandler & { server?: CommentsServer } {
  if (config.disabled) {
    const notFound: NodePagesHandler = async (_req, res) => {
      res.statusCode = 404
      res.end()
    }
    return notFound
  }
  const server = createCommentsServer(config)
  const handler = createNextPagesHandler(server) as NodePagesHandler & { server?: CommentsServer }
  handler.server = server
  return handler
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @airnauts/comments-next exec vitest run src/index.test.ts`
Expected: PASS (4 cases).

- [ ] **Step 5: Typecheck the package**

Run: `pnpm --filter @airnauts/comments-next typecheck`
Expected: no errors. (If it complains about `@airnauts/comments-server/node` types, rebuild the server: `pnpm --filter @airnauts/comments-server build`.)

- [ ] **Step 6: Commit**

```bash
git add packages/next/src/index.ts packages/next/src/index.test.ts
git commit -m "feat(next)!: unified createCommentsAppRoute + createCommentsPagesRoute

BREAKING CHANGE: createCommentsRoute is renamed to createCommentsAppRoute; a new
createCommentsPagesRoute adds Pages Router support. No back-compat alias.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Phase C — migrate call sites and docs

### Task 8: Migrate the example host

**Files:**
- Modify: `examples/nextjs-host/app/api/comments/[...path]/route.ts`

- [ ] **Step 1: Switch to the new name**

In `examples/nextjs-host/app/api/comments/[...path]/route.ts`:
- Change the import `import { createCommentsRoute } from '@airnauts/comments-next'` to `import { createCommentsAppRoute } from '@airnauts/comments-next'`.
- Change `export const { GET, POST, PATCH, OPTIONS } = createCommentsRoute({` to `export const { GET, POST, PATCH, OPTIONS } = createCommentsAppRoute({`.
(Leave the entire config body — `extensions`, repository/storage switches, etc. — unchanged.)

- [ ] **Step 2: Typecheck the example**

Run: `pnpm --filter @airnauts/comments-server build && pnpm --filter @airnauts/comments-next build && pnpm --filter @airnauts/comments-nextjs-host typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add examples/nextjs-host/app/api/comments/[...path]/route.ts
git commit -m "chore(example): use createCommentsAppRoute in the Next host

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: Migrate the mongo integration test

**Files:**
- Modify: `packages/adapter-mongo/src/integration.test.ts`, `packages/adapter-mongo/package.json`

- [ ] **Step 1: Add the dev dependency**

In `packages/adapter-mongo/package.json`, add to `devDependencies` (keep alphabetical with the other `@airnauts/*` dev deps):
```json
"@airnauts/comments-next": "workspace:*",
```

- [ ] **Step 2: Switch the import**

In `packages/adapter-mongo/src/integration.test.ts`, change line 4:
- From `import { createNextHandler } from '@airnauts/comments-server/next'`
- To `import { createNextHandler } from '@airnauts/comments-next'`
(The `createNextHandler(server)` usage on line 49 stays identical — same signature.)

- [ ] **Step 3: Install + run the integration test**

Run:
```bash
pnpm install && pnpm --filter @airnauts/comments-next build && pnpm --filter @airnauts/comments-adapter-mongo test
```
Expected: PASS (the workspace link for the new dev dep resolves after `pnpm install`).

- [ ] **Step 4: Commit**

```bash
git add packages/adapter-mongo/src/integration.test.ts packages/adapter-mongo/package.json pnpm-lock.yaml
git commit -m "test(adapter-mongo): import createNextHandler from comments-next

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: Update documentation

**Files:**
- Modify: `README.md`, `docs/integration.md`, `packages/next/README.md`, `packages/server/README.md`

- [ ] **Step 1: Root README — App Router quick start**

In `README.md`, in the App Router quick-start block, change the import and call from `createCommentsRoute` to `createCommentsAppRoute`:
```ts
import { createCommentsAppRoute } from '@airnauts/comments-next'

export const { GET, POST, PATCH, OPTIONS } = createCommentsAppRoute({
  // …unchanged config…
})
```

- [ ] **Step 2: Root README — rewrite the Pages Router section**

In `README.md`, replace the entire *Alternative setups → Server — Next.js Pages Router* section body (the prose + the ~30-line manual-bridge code block) with the helper-based version:
````markdown
### Server — Next.js Pages Router

On the Pages Router, mount a catch-all API route with `createCommentsPagesRoute`:

```ts
// pages/api/comments/[...path].ts
import { createCommentsPagesRoute } from '@airnauts/comments-next'
import { memoryRepository } from '@airnauts/comments-adapter-memory'

// REQUIRED: Next reads this statically, so the helper can't set it. The comments
// API parses JSON/multipart itself, so the raw body must reach it unparsed.
export const config = { api: { bodyParser: false } }

export default createCommentsPagesRoute({
  secretKey: process.env.COMMENTS_SECRET ?? 'dev-key',
  projectId: 'my-app',
  allowedOrigins: ['http://localhost:3000'],
  repository: memoryRepository(),
  storage: { async put(blob) { return { url: `mem://${blob.name}`, key: blob.name, size: 0 } } },
  rateLimit: false,
})
```

A single default export handles every method — `server.handle` answers the CORS
preflight (`OPTIONS`) internally. Keep this on the **Node runtime** (the default):
the server uses `node:crypto`, `Buffer`, and Node-only database drivers, so it
cannot run on the Edge runtime. For production, swap `memoryRepository()` and the
storage stub for `mongoRepository({ uri })` + `vercelBlobStorage({ token })` (or
`fileSystemStorage`), exactly as in the App Router Quick start.
````
Also, in the *Alternative setups* lead-in bullet that says "bridges `req`/`res` exactly as the Pages Router example does", update it so it no longer claims the Pages Router example hand-bridges — it now uses `createCommentsPagesRoute`; the manual bridge story is only for non-Next Node hosts.

- [ ] **Step 3: docs/integration.md**

In `docs/integration.md`, change both `createCommentsRoute` import + call sites to `createCommentsAppRoute`, and update the prose line "`createCommentsRoute` builds the server and its four Next App Router handlers" to name `createCommentsAppRoute`. If a Pages Router mention is appropriate alongside, add a one-liner pointing to `createCommentsPagesRoute`.

- [ ] **Step 4: packages/next/README.md**

In `packages/next/README.md`:
- Update the summary line "Wraps `createCommentsServer` and `createNextHandler` into a single `createCommentsRoute(config)` call" to describe the pair: App Router via `createCommentsAppRoute`, Pages Router via `createCommentsPagesRoute`.
- Update the description to say "Next.js App **and Pages** Router integration".
- Replace the `createCommentsRoute` example(s) with `createCommentsAppRoute`, and add a short Pages Router example using `createCommentsPagesRoute` + the `bodyParser: false` caveat.
- Rename the `### createCommentsRoute(config)` API heading to `### createCommentsAppRoute(config)` and add a `### createCommentsPagesRoute(config)` heading.
- Also update `packages/next/package.json`'s `description` from "Next.js App Router integration for the Airnauts commenting tool server." to "Next.js App and Pages Router integration for the Airnauts commenting tool server."

- [ ] **Step 5: packages/server/README.md**

In `packages/server/README.md`:
- Replace the two mentions of `@airnauts/comments-next` "App Router integration (`createCommentsRoute`)" so they point at `comments-next` for **both App and Pages Router** (`createCommentsAppRoute` / `createCommentsPagesRoute`).
- Remove any reference to the now-deleted `@airnauts/comments-server/next` subpath; document `@airnauts/comments-server/node` (the generic `nodeRequestToWeb` / `webToNode` bridge for mounting on any Node server).

- [ ] **Step 6: Commit**

```bash
git add README.md docs/integration.md packages/next/README.md packages/next/package.json packages/server/README.md
git commit -m "docs: document createCommentsAppRoute/PagesRoute and the /node bridge

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 11: ADR-0036 + supersession notes + architecture.md

**Files:**
- Modify: `docs/adr.md`, `docs/architecture.md`

- [ ] **Step 1: Append ADR-0036**

At the end of `docs/adr.md`, append:
```markdown

## ADR-0036 — Relocate Next.js adapters into `comments-next`; `comments-server` exposes a generic Node bridge

- **Date:** 2026-06-15
- **Status:** accepted

**Context.** `@airnauts/comments-server/next` placed the Next App Router handler
(ADR-0015) inside the framework-agnostic server runtime, and `@airnauts/comments-next`
wrapped it as `createCommentsRoute` (ADR-0022). Adding Pages Router support (issue
#26) would deepen Next coupling in the server package. The Node↔Web bridge that the
handlers need also lives (privately) in `comments-server`'s `dev.ts`, and
`comments-server` cannot depend on `comments-next` (the dependency edge runs the
other way), so the bridge must stay in `comments-server`.

**Decision.** Move all Next.js coupling into `@airnauts/comments-next`:
`createNextHandler` (App Router), a new `createNextPagesHandler` (Pages Router), the
pure `operationUrl` mount-stripper, and two public wrappers `createCommentsAppRoute`
/ `createCommentsPagesRoute`. `createCommentsRoute` is **renamed** to
`createCommentsAppRoute` with no back-compat alias (pre-1.0). `@airnauts/comments-server`
drops its `./next` subpath and adds a public `./node` subpath exporting the generic
`nodeRequestToWeb` / `webToNode` bridge, consumed by `dev.ts` and mountable on any
Node server (groundwork for #24). Pages Router hosts must still export
`config = { api: { bodyParser: false } }`; the handler guards loudly if it is absent.

**Consequences.** `comments-server` becomes Next-agnostic; `comments-next` owns the
Next surface. Breaking for both packages (pre-1.0 → `minor`): `@airnauts/comments-server/next`
is removed (no shim is possible — a re-export would be circular) and `createCommentsRoute`
is gone. Supersedes the `createNextHandler` placement in ADR-0015 and the
`createCommentsRoute` naming in ADR-0022.
```

- [ ] **Step 2: Status note on ADR-0015**

In `docs/adr.md`, under the `## ADR-0015 — M4 deployment glue …` heading, change its status line from:
```markdown
- **Status:** accepted
```
to:
```markdown
- **Status:** accepted; `createNextHandler` placement superseded by ADR-0036
```
(There are several `- **Status:** accepted` lines; match the one immediately under the ADR-0015 heading and its `- **Date:** 2026-05-29` line.)

- [ ] **Step 3: Status note on ADR-0022**

In `docs/adr.md`, under the `## ADR-0022 — Next.js integration package (@airnauts/comments-next)` heading, change its status line from:
```markdown
- **Status:** accepted
```
to:
```markdown
- **Status:** accepted; `createCommentsRoute` renamed to `createCommentsAppRoute` by ADR-0036
```
(Match the `- **Status:** accepted` line immediately under the ADR-0022 heading / its `- **Date:** 2026-06-02` line.)

- [ ] **Step 4: Reframe architecture.md — the server bullet**

In `docs/architecture.md`, replace:
```markdown
- **`@airnauts/comments-server`** — the Web-standard `Request → Response` core + business
  logic; depends only on adapter interfaces. Subpath **`@airnauts/comments-server/next`**
  is the App Router glue.
```
with:
```markdown
- **`@airnauts/comments-server`** — the Web-standard `Request → Response` core + business
  logic; depends only on adapter interfaces. Subpath **`@airnauts/comments-server/node`**
  is a generic Node↔Web bridge (`nodeRequestToWeb` / `webToNode`) for mounting on any
  Node server.
- **`@airnauts/comments-next`** — all Next.js glue: App Router (`createCommentsAppRoute`)
  and Pages Router (`createCommentsPagesRoute`) one-call integrations.
```

- [ ] **Step 5: Reframe architecture.md — the glue snippet**

In `docs/architecture.md`, replace:
```markdown
**Next.js glue is near-zero** — Next passes a native Web `Request`:

```ts
// app/api/comments/[...path]/route.ts
export const { GET, POST, PATCH } = createNextHandler(server)
```

Express/Node adapters can wrap the same core later.
```
with:
```markdown
**Next.js glue is near-zero** — `@airnauts/comments-next` builds the server and its
handlers in one call:

```ts
// App Router — app/api/comments/[...path]/route.ts
export const { GET, POST, PATCH, OPTIONS } = createCommentsAppRoute(config)
// Pages Router — pages/api/comments/[...path].ts
export default createCommentsPagesRoute(config)
```

Other Node hosts wrap the same core via `@airnauts/comments-server/node`.
```

- [ ] **Step 6: Commit**

```bash
git add docs/adr.md docs/architecture.md
git commit -m "docs: ADR-0036 relocate Next adapters; supersede ADR-0015/0022

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 12: Changeset

**Files:**
- Create: `.changeset/next-pages-router.md`

- [ ] **Step 1: Write the changeset**

Create `.changeset/next-pages-router.md`:
```markdown
---
"@airnauts/comments-next": minor
"@airnauts/comments-server": minor
---

Add first-class Next.js Pages Router support and unify the Next integration. `@airnauts/comments-next` now exports `createCommentsAppRoute` (App Router) and `createCommentsPagesRoute` (Pages Router); the old `createCommentsRoute` is renamed to `createCommentsAppRoute`. All Next.js glue moves into `@airnauts/comments-next`: `@airnauts/comments-server` drops the `@airnauts/comments-server/next` subpath and adds `@airnauts/comments-server/node`, a generic Node↔Web bridge (`nodeRequestToWeb` / `webToNode`) for mounting on any Node server.

BREAKING: `createCommentsRoute` → `createCommentsAppRoute`; `@airnauts/comments-server/next` (`createNextHandler`) moves to `@airnauts/comments-next`.
```

- [ ] **Step 2: Verify changeset status**

Run: `pnpm changeset status`
Expected: lists `@airnauts/comments-next` and `@airnauts/comments-server` at `minor` (and the rest of the fixed group bumping with them).

- [ ] **Step 3: Commit**

```bash
git add .changeset/next-pages-router.md
git commit -m "chore: changeset for Pages Router + unified Next exports

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Phase D — full verification

### Task 13: Whole-repo gate

**Files:** none (verification only)

- [ ] **Step 1: Clean install + build**

Run: `pnpm install && pnpm build`
Expected: all packages build with no errors.

- [ ] **Step 2: Lint**

Run: `pnpm lint`
Expected: Biome reports no errors.

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: no errors across the workspace.

- [ ] **Step 4: Test**

Run: `pnpm test`
Expected: all package suites pass (server: `node.test.ts` + existing; next: `operation-url`, `app-router`, `pages-router`, `index`; adapter-mongo integration).

- [ ] **Step 5: Export-resolution check**

Run: `pnpm check:exports`
Expected: every listed entry resolves, including `@airnauts/comments-server/node -> nodeRequestToWeb`. (Confirm the script no longer references `@airnauts/comments-server/next`.)

- [ ] **Step 6: Grep for stragglers**

Run:
```bash
rg -n "createCommentsRoute|comments-server/next" --glob '!**/dist/**' --glob '!**/CHANGELOG.md' --glob '!docs/adr.md' --glob '!docs/milestones.md' --glob '!docs/superpowers/**'
```
Expected: no matches (historical CHANGELOGs, ADR bodies, prior specs, and `docs/milestones.md` are intentionally excluded — milestones.md keeps the historical `@airnauts/comments-server/next` / `createNextHandler` API names that were correct at the time each milestone shipped).

- [ ] **Step 7: Final confirmation**

There is nothing to commit if Tasks 1–12 each committed. Confirm a clean tree:
Run: `git status --short`
Expected: empty.

---

## Self-review notes (author)

- **Spec coverage:** Pages handler (Tasks 6–7), unified renamed exports (Task 7), relocation + `/node` bridge (Tasks 1–3, 5), bodyParser guard (Task 6), `.server` attachment (Task 7), structural typing/no `next` dep (Task 6 `NodePagesRequest`), `disabled`→404 (Task 7), migrations (Tasks 8–10), ADR-0036 + supersessions + architecture (Task 11), changeset (Task 12) — all present.
- **Type consistency:** `NodePagesHandler` / `NodePagesRequest` defined in Task 6 and reused in Task 7; `operationUrl` signature consistent across Tasks 4/5/6; `nodeRequestToWeb(req, url)` / `webToNode(res, nodeRes)` consistent across Tasks 1/2/6.
- **No placeholders:** every code/command step shows concrete content.
```
