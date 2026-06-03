# Disabled Route Flag + Explicit Vercel Blob Token Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a route-level `disabled?: boolean` flag to `createCommentsRoute` (all handlers 404, no server built) and make `vercelBlobStorage`'s `token` a required, explicitly-passed argument.

**Architecture:** `disabled` lives on `createCommentsRoute`'s param type only — the server core (`CreateCommentsServerOptions`) stays unaware. When set, the four Next handlers return 404 and `createCommentsServer` is never called, so the return type widens `server` to optional. Separately, `vercelBlobStorage` mirrors `mongoRepository({ uri })`: `token` becomes required (type-level enforcement, no runtime guard), dropping `@vercel/blob`'s ambient `process.env` read from the documented path.

**Tech Stack:** TypeScript, Vitest (`vitest run`), `tsc --build` (typecheck), tsup, Biome (`biome ci`), Changesets. Backend packages → TDD.

Spec: `docs/superpowers/specs/2026-06-03-disabled-route-and-explicit-blob-token-design.md`.

---

### Task 1: Require `token` in `vercelBlobStorage`

The runtime behavior of `put()` is unchanged (it already forwards `token: this.opts.token`); this change is enforced at the **type** level. The failing test is therefore a compile-time `@ts-expect-error` contract caught by `tsc --build` (not by `vitest`, which does not typecheck).

**Files:**
- Test: `packages/storage-vercel-blob/src/index.test.ts`
- Modify: `packages/storage-vercel-blob/src/index.ts`

- [ ] **Step 1: Write the failing type-contract test**

Append this case inside the existing `describe('vercelBlobStorage', ...)` block in `packages/storage-vercel-blob/src/index.test.ts` (after the existing `it('returns a StorageAdapter', ...)` at line 47):

```ts
  it('requires an explicit token (no ambient process.env read)', () => {
    // @ts-expect-error token is required — calling with no args must not typecheck.
    vercelBlobStorage()
    // @ts-expect-error token is required — an options object without token must not typecheck.
    vercelBlobStorage({ prefix: 'x/' })
    const store = vercelBlobStorage({ token: 'explicit-token' })
    expect(typeof store.put).toBe('function')
  })
```

- [ ] **Step 2: Run typecheck to verify it fails**

Run: `pnpm -C packages/storage-vercel-blob typecheck`
Expected: FAIL — TS error `Unused '@ts-expect-error' directive` on both directives, because `token` is currently optional so those calls compile fine.

- [ ] **Step 3: Make `token` required and drop the `= {}` defaults**

In `packages/storage-vercel-blob/src/index.ts`, change the options type (lines 4–13) so `token` is required and the doc comment no longer mentions the env fallback:

```ts
export type VercelBlobStorageOptions = {
  /** `BLOB_READ_WRITE_TOKEN`, passed explicitly (no ambient `process.env` read). */
  token: string
  /**
   * Optional prefix (e.g. 'staging/') applied to every key. A trailing `/` is
   * appended automatically if missing, so `'staging'` and `'staging/'` behave
   * the same way.
   */
  prefix?: string
}
```

Change the class constructor (line 49) to drop the `= {}` default:

```ts
  constructor(private readonly opts: VercelBlobStorageOptions) {
```

Change the factory (line 73) to drop the `= {}` default:

```ts
export function vercelBlobStorage(opts: VercelBlobStorageOptions): StorageAdapter {
  return new VercelBlobStorage(opts)
}
```

Leave `put()` (lines 54–69) untouched — it already passes `token: this.opts.token`.

- [ ] **Step 4: Run typecheck to verify it passes**

Run: `pnpm -C packages/storage-vercel-blob typecheck`
Expected: PASS — both `@ts-expect-error` directives are now "used" (the no-token calls are real type errors).

- [ ] **Step 5: Run the unit tests**

Run: `pnpm -C packages/storage-vercel-blob test`
Expected: PASS — the `BLOB_READ_WRITE_TOKEN`-gated contract suite skips locally; `vercelBlobStorage` describe block passes (existing call already uses `{ token: 'test-token' }`).

- [ ] **Step 6: Commit**

```bash
git add packages/storage-vercel-blob/src/index.ts packages/storage-vercel-blob/src/index.test.ts
git commit -m "feat(storage-vercel-blob)!: require explicit token (BREAKING)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Add `disabled` flag to `createCommentsRoute`

**Files:**
- Test: `packages/next/src/index.test.ts`
- Modify: `packages/next/src/index.ts`

- [ ] **Step 1: Write the failing test**

Add this case inside `describe('createCommentsRoute', ...)` in `packages/next/src/index.test.ts` (after the existing `'also returns the underlying server'` test). It exercises all four handlers and asserts no server is built:

```ts
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
```

Also update the existing `'also returns the underlying server'` test to narrow the now-optional `server` (line 54): change `route.server.handle` to `route.server?.handle`:

```ts
  it('also returns the underlying server', () => {
    const route = build()
    expect(typeof route.server?.handle).toBe('function')
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -C packages/next test`
Expected: FAIL — `createCommentsRoute` does not accept `disabled` (type error) and/or the new test fails because every handler currently builds a real server and does not 404.

- [ ] **Step 3: Implement the `disabled` branch**

Replace the body of `createCommentsRoute` in `packages/next/src/index.ts` (lines 16–21):

```ts
export function createCommentsRoute(
  config: CreateCommentsServerOptions & { disabled?: boolean },
): NextRouteHandlers & { server?: CommentsServer } {
  if (config.disabled) {
    // `NextHandler` is not exported from the server package; an inline async
    // arrow returning a Response structurally satisfies the handler signature.
    const notFound = async () => new Response('Not Found', { status: 404 })
    return { GET: notFound, POST: notFound, PATCH: notFound, OPTIONS: notFound }
  }
  const server = createCommentsServer(config)
  return { ...createNextHandler(server), server }
}
```

Update the doc comment above the function (lines 7–15) so the export example notes the optional server — change the closing sentence to:

```ts
 * Also returns `server` (absent when `disabled`) for hosts that need server-side
 * reads, extra routes, or server access in tests.
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm -C packages/next test`
Expected: PASS — disabled route 404s all four methods and `route.server` is `undefined`; the round-trip test still passes via the enabled path.

- [ ] **Step 5: Typecheck**

Run: `pnpm -C packages/next typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/next/src/index.ts packages/next/src/index.test.ts
git commit -m "feat(next)!: add disabled flag to createCommentsRoute (BREAKING: server now optional)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Update example route and integration docs

No tests — these are the consumer-facing call sites that must move to the new APIs so nothing references the pre-change signatures.

**Files:**
- Modify: `examples/nextjs-host/app/api/comments/[...path]/route.ts:17-19`
- Modify: `docs/integration.md` (around lines 82, 95–105)

- [ ] **Step 1: Update the example route's storage line**

In `examples/nextjs-host/app/api/comments/[...path]/route.ts`, change the `vercelBlobStorage()` call (line 18). Inside the truthy branch `process.env.BLOB_READ_WRITE_TOKEN` is already narrowed to `string`, so no cast is needed:

```ts
  // Vercel Blob when its token is present, else local public/uploads.
  storage: process.env.BLOB_READ_WRITE_TOKEN
    ? vercelBlobStorage({ token: process.env.BLOB_READ_WRITE_TOKEN })
    : fileSystemStorage({ rootDir: join(process.cwd(), 'public', 'uploads'), baseUrl: '/uploads' }),
```

- [ ] **Step 2: Typecheck the example app**

Run: `pnpm -C examples/nextjs-host typecheck` (if the script exists; otherwise `pnpm -C examples/nextjs-host build`)
Expected: PASS — the narrowed `string` satisfies the now-required `token`.

- [ ] **Step 3: Update `docs/integration.md`**

Read `docs/integration.md` around lines 82 and 95–110. Update the storage swap example so the `vercelBlobStorage()` call passes a token, e.g.:

```ts
import { vercelBlobStorage } from '@airnauts/comments-storage-vercel-blob'
// ...
  storage: process.env.BLOB_READ_WRITE_TOKEN
    ? vercelBlobStorage({ token: process.env.BLOB_READ_WRITE_TOKEN })
    : /* dev/local fallback */,
```

In the same doc, where `createCommentsRoute` is introduced, add a sentence documenting the flag:

```md
Pass `disabled: true` to keep the route mounted but dormant — every handler
returns `404` and no server is constructed (e.g. when a required backend env var
is absent in local dev or a preview deploy). `route.server` is `undefined` in that
case.
```

- [ ] **Step 4: Lint the docs/code touched**

Run: `pnpm lint`
Expected: PASS (biome ci, the strict gate).

- [ ] **Step 5: Commit**

```bash
git add examples/nextjs-host/app/api/comments/[...path]/route.ts docs/integration.md
git commit -m "docs: update example route + integration guide for explicit blob token and disabled flag

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Record ADR-0027 and ADR-0028

**Files:**
- Modify: `docs/adr.md` (append, newest-last)

- [ ] **Step 1: Append the two ADRs**

Append to the end of `docs/adr.md` (keep the file's existing heading style; match the format of ADR-0024 above it):

```md
## ADR-0027: Route-level `disabled` flag on `createCommentsRoute`

**Date:** 2026-06-03
**Status:** accepted

**Context.** A Next.js host often wants the commenting tool live only when its
backends are provisioned (e.g. both `MONGODB_URI` and `BLOB_READ_WRITE_TOKEN`).
When a backend is absent — local dev, preview deploys — the mounted route should
answer `404` to every method and the widget should stay dormant. Hosts expressed
this with a ternary hand-building `{ GET: notFound, POST: notFound, ... }`.

**Decision.** Add an optional `disabled?: boolean` to `createCommentsRoute`'s
parameter type only — `CreateCommentsServerOptions` (the server core) stays
unaware of it. When truthy, the function returns four handlers that each respond
`404 Not Found` and never calls `createCommentsServer`. The returned `server` is
therefore widened to optional (`server?: CommentsServer`) and is `undefined` on
the disabled path. The other config fields stay required (an "added optional
flag", not a discriminated union — chosen for minimal type machinery).

**Consequences.** Hosts drop the hand-rolled `notFound` boilerplate. Breaking for
`@airnauts/comments-next`: consumers reading `route.server` must now narrow it
(`route.server?.…`). When disabled, no rate limiter is built and the lazy
repository/storage are never touched. Ships as a minor (pre-1.0) BREAKING bump.

## ADR-0028: Explicit `token` for `vercelBlobStorage` (no ambient env read)

**Date:** 2026-06-03
**Status:** accepted

**Context.** `vercelBlobStorage`'s `token` was optional; when omitted, `@vercel/blob`
read `BLOB_READ_WRITE_TOKEN` from `process.env` automatically. That ambient read
was inconsistent with the other adapters — `mongoRepository({ uri })` and
`fileSystemStorage({ rootDir, baseUrl })` take their configuration explicitly.

**Decision.** Make `token: string` required on `VercelBlobStorageOptions` and drop
the `= {}` default from both the `VercelBlobStorage` class constructor and the
`vercelBlobStorage` factory. The host passes the env value in explicitly, mirroring
`mongoRepository`. Enforcement is type-level only: like `mongoRepository` (which
does not validate `uri`), no runtime guard is added — a caller defeating the type
(`undefined as string`) would still hit `@vercel/blob`'s env fallback.

**Consequences.** Configuration is uniform and explicit across adapters. Breaking
for `@airnauts/comments-storage-vercel-blob`: `vercelBlobStorage()` /
`new VercelBlobStorage()` with no token no longer typecheck. Ships as a minor
(pre-1.0) BREAKING bump.
```

- [ ] **Step 2: Commit**

```bash
git add docs/adr.md
git commit -m "docs(adr): ADR-0027 disabled route flag, ADR-0028 explicit blob token

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Add Changesets

**Files:**
- Create: `.changeset/disabled-route-flag.md`
- Create: `.changeset/explicit-blob-token.md`

- [ ] **Step 1: Write the `@airnauts/comments-next` changeset**

Create `.changeset/disabled-route-flag.md`:

```md
---
"@airnauts/comments-next": minor
---

Add a `disabled?: boolean` flag to `createCommentsRoute`. When set, every handler
(`GET`/`POST`/`PATCH`/`OPTIONS`) returns `404` and no server is constructed — for
keeping the route mounted but dormant when a backend is unconfigured.

BREAKING: the returned `server` is now optional (`server?: CommentsServer`) — it is
`undefined` on the disabled path. Consumers reading `route.server` must narrow it.
```

- [ ] **Step 2: Write the `@airnauts/comments-storage-vercel-blob` changeset**

Create `.changeset/explicit-blob-token.md`:

```md
---
"@airnauts/comments-storage-vercel-blob": minor
---

BREAKING: `vercelBlobStorage` now requires an explicit `token`. The previous
ambient read of `BLOB_READ_WRITE_TOKEN` from `process.env` is gone — pass the value
in, the same way as `mongoRepository({ uri })`. `vercelBlobStorage()` and
`new VercelBlobStorage()` with no token no longer typecheck.
```

- [ ] **Step 3: Commit**

```bash
git add .changeset/disabled-route-flag.md .changeset/explicit-blob-token.md
git commit -m "chore: changesets for disabled route flag and explicit blob token

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Full verification

- [ ] **Step 1: Build, typecheck, test, lint the whole repo**

```bash
pnpm build && pnpm typecheck && pnpm test && pnpm lint
```

Expected: all green. (`pnpm build` runs `tsc --build --force` per package — guards against the stale-`.tsbuildinfo` `.d.ts` corruption documented in ADR-0023.)

- [ ] **Step 2: Confirm no stale references to the old APIs**

```bash
grep -rn "vercelBlobStorage()" --include="*.ts" --include="*.tsx" --include="*.md" . | grep -v node_modules | grep -v "/dist/" | grep -v "/docs/superpowers/"
```

Expected: no matches outside historical spec/plan docs (those are point-in-time records and stay as-is).
