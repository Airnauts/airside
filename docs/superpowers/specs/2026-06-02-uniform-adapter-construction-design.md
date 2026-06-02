# Uniform adapter construction + `@airnauts/comments-next` — design

- **Status:** Approved
- **Date:** 2026-06-02
- **Track:** Integration / packaging · Size: M
- **Source of truth:** [`docs/architecture.md`](../../architecture.md) §2, §9 · [`docs/adr.md`](../../adr.md)
- **Depends on:** existing `Repository` + `StorageAdapter` interfaces and their shared
  contract suites (`repositoryContract`, `storageContract` in `@airnauts/comments-test-support`)

## Goal

Make a host's commenting integration collapse to a **single Next.js route file**
with **no bespoke glue**, by giving every persistence/storage adapter the **same
construction shape** — one factory function per adapter that returns the shared
interface:

```ts
memoryRepository()                                  // → Repository  (@airnauts/comments-adapter-memory)
mongoRepository({ uri })                            // → Repository  (@airnauts/comments-adapter-mongo)
fileSystemStorage({ rootDir, baseUrl })             // → StorageAdapter
vercelBlobStorage({ token?, prefix? })              // → StorageAdapter
```

Every adapter — including in-memory — is its own package with a uniform factory, so
`@airnauts/comments-server` is left as a pure engine that depends on no concrete
adapter.

The two **interfaces are already uniform** — `Repository` (6 methods) and
`StorageAdapter` (`put`), each enforced across adapters by a shared contract suite.
What is *not* uniform today is **construction + connection lifecycle**:
`new InMemoryRepository()` vs. `createMongoRepository({ db })` (needs an
already-connected `Db`) vs. the example's hand-written `mongoRepository(uri)` glue;
`new FileSystemStorage(...)` vs. `new VercelBlobStorage(...)` vs. the example's
`publicUploadsStorage()` url-rewrite wrapper. This design unifies the construction
shape and folds the example glue into the adapters.

It also extracts the one genuinely generic piece — **connection memoization for
lazily-connecting repositories** (warm serverless / HMR reuse) — into a reusable
primitive, so future Postgres/Redis adapters slot in by writing only a `connect`
thunk.

## Non-goals

- **No Postgres/Redis adapters now** (YAGNI). Only the generic `lazyRepository`
  primitive that they will reuse later.
- **No monolithic `createRepository({ driver })` dispatcher.** A single entry that
  branches on a driver string would have to import every adapter, pulling
  `mongodb`/`pg`/`redis` into one module regardless of which is used. Per-adapter
  factories keep one import per adapter actually used, with no dependency bloat.
  (Rejected; see Alternatives.)
- **No env-var magic in any package.** Packages read no environment variables. The
  mongo/memory and blob/fs switches stay host-owned, expressed as explicit ternaries
  in the single route file.
- **No storage memoization layer.** FS is stateless and Vercel Blob is per-call
  HTTP — there is no connection to memoize. `lazyRepository` is repository-only.

## The generic primitive — `lazyRepository` (in `@airnauts/comments-server`)

A pure helper (zero driver deps) that turns an async `connect` into a synchronously
constructable, memoized `Repository`:

```ts
export function lazyRepository(
  connect: () => Promise<Repository>,
  opts: { cacheKey: string },
): Repository
```

Behavior (ported from the example's `mongo-repository.ts`, generalized):

- **Synchronous construction; connects on first method call** — so a server can be
  built at module load without `await`. Every one of the 6 `Repository` methods is
  forwarded as `() => get().then((r) => r.method(...))`.
- **Memoization across warm serverless invocations / HMR reloads.** The connected
  `Promise<Repository>` is cached on a single `globalThis` registry keyed by
  `opts.cacheKey`, so repeated factory calls and module re-evaluations reuse one
  connection. Distinct `cacheKey`s coexist (multiple connections / adapters).
- **Retry on failure.** If `connect()` rejects, the cache entry for that `cacheKey`
  is cleared so the next call retries instead of returning a poisoned promise.

Registry shape (replaces the example's single `globalThis.__commentsRepo`):

```ts
const globalForRepos = globalThis as unknown as {
  __commentsRepos?: Map<string, Promise<Repository>>
}
```

## Repository factories

### `memoryRepository()` — in `@airnauts/comments-adapter-memory` (new package)

`InMemoryRepository` moves **out of `server`** into a new
`@airnauts/comments-adapter-memory` package (`packages/adapter-memory`), so the
in-memory backend is its own adapter package like Mongo. The package exports:

```ts
export function memoryRepository(): Repository {
  return new InMemoryRepository()
}
export { InMemoryRepository } // advanced/direct use
```

- A **factory function** (not `export const x = new InMemoryRepository()`): returns a
  fresh store per call and matches the `xxxRepository(...)` shape; a shared singleton
  would leak state across callers/tests.
- Takes **no arguments** — in-memory has no real config, and an ignored config param
  would mislead. The uniformity that matters ("one factory → `Repository`") holds.
- **Depends on `@airnauts/comments-server`** for the `Repository` type and the
  `decodeCursor`/`encodeCursor` codec (already public exports; `InMemoryRepository`
  currently imports them from server's `../cursor`). No `lazyRepository` needed —
  in-memory is synchronous with no connection.
- **Clean breaking move — server no longer exports `InMemoryRepository`.** A
  back-compat re-export would recreate a `server → memory` *runtime* edge (the cycle
  we are avoiding); pre-1.0 makes the clean move acceptable. `lazyRepository` stays in
  `server` (it is the shared primitive Mongo and future adapters build on).
- **Consequence — a dev-only workspace cycle.** `server`'s and `client`'s **tests**
  use `new InMemoryRepository()` (~12 files), so both gain a `devDependency` on
  `@airnauts/comments-adapter-memory`, which depends on `server`. Benign: pnpm allows
  cyclic dev deps; `tsc --build` project references stay acyclic because server's
  *non-test* build never imports memory (tests are excluded from the build and run
  under vitest/esbuild without project references). The test files swap their import
  from `'./repository/in-memory'` / `'@airnauts/comments-server'` to
  `'@airnauts/comments-adapter-memory'`.

### `mongoRepository({ uri, cacheKey? })` — in `@airnauts/comments-adapter-mongo`

```ts
export function mongoRepository(
  { uri, cacheKey = 'mongo' }: { uri: string; cacheKey?: string },
): Repository {
  return lazyRepository(() => connectMongo(uri), { cacheKey })
}

// connectMongo: open one MongoClient, connect, ensureIndexes, build the repo.
async function connectMongo(uri: string): Promise<Repository> {
  const client = new MongoClient(uri)
  await client.connect() // client intentionally left open for the process lifetime
  const db = client.db() // database name comes from the connection string
  await ensureIndexes(db)
  return createMongoRepository({ db })
}
```

- The single function a host imports for Mongo. Built on `lazyRepository`, so all the
  memoization/lazy/retry behavior is shared, not re-implemented.
- `createMongoRepository({ db })` and `ensureIndexes(db)` stay exported — the pure,
  lifecycle-free factory (used by the contract tests and by advanced users who own
  their own connection). `mongoRepository` is layered on top of them.
- `@airnauts/comments-adapter-mongo` **already** depends on `mongodb` and
  `@airnauts/comments-server` at runtime, so no new deps are needed — it just now also
  constructs the `MongoClient` (previously the host's job). `lazyRepository` is
  imported from `@airnauts/comments-server`.

## Storage factories

The `StorageAdapter` interface is unchanged. Each storage adapter gains a
lowercase factory mirroring the repository shape; classes stay exported.

### `fileSystemStorage` + `baseUrl` — in `@airnauts/comments-storage-fs`

- Add `baseUrl?: string` to `FileSystemStorageOptions`. When set, `put` returns
  `url: \`${baseUrl.replace(/\/$/, '')}/${key}\`` (a browser-served path) instead of
  the default `file://…`. When omitted, behavior is unchanged.
- Add the factory:

  ```ts
  export function fileSystemStorage(opts: FileSystemStorageOptions): StorageAdapter {
    return new FileSystemStorage(opts)
  }
  ```

- This folds the example's `publicUploadsStorage()` (which wrote under
  `public/uploads/` and rewrote the `file://` url to `/uploads/<key>`) into pure
  config: `fileSystemStorage({ rootDir: …/public/uploads, baseUrl: '/uploads' })`
  returns `/uploads/<key>`, identical to today. The example glue file is deleted.

### `vercelBlobStorage` — in `@airnauts/comments-storage-vercel-blob`

```ts
export function vercelBlobStorage(opts: VercelBlobStorageOptions = {}): StorageAdapter {
  return new VercelBlobStorage(opts)
}
```

## `createCommentsRoute` — in `@airnauts/comments-next` (new package)

`packages/next`, published as `@airnauts/comments-next`. One Next-specific export
(the only piece that is genuinely Next-shaped — it wraps the existing
`createNextHandler`):

```ts
import type { CommentsServer, CreateCommentsServerOptions } from '@airnauts/comments-server'
import { createCommentsServer } from '@airnauts/comments-server'
import { createNextHandler } from '@airnauts/comments-server/next'

type NextRouteHandlers = ReturnType<typeof createNextHandler>

export function createCommentsRoute(
  config: CreateCommentsServerOptions,
): NextRouteHandlers & { server: CommentsServer } {
  const server = createCommentsServer(config)
  return { ...createNextHandler(server), server }
}
```

- `config` is the `createCommentsServer` config verbatim
  (`{ secretKey, projectId, allowedOrigins, repository, storage, rateLimit? }`).
- Returns the four Next route handlers **plus `server`** — the escape hatch for
  hosts that need server-side reads, extra routes, or server access in tests,
  without constructing the server separately.
- Deps: `@airnauts/comments-server` (`workspace:^`). Packaged like the other
  published packages (MIT, `publishConfig.access: public`, `tsup && tsc --build`,
  `clean: true` per ADR-0019).

Both new packages — `@airnauts/comments-next` and `@airnauts/comments-adapter-memory`
— are added to the Changesets release set, taking the published count from 6 to 8.

## Host route file — the entire integration, zero `lib/` glue

```ts
// app/api/comments/[...path]/route.ts
import { createCommentsRoute } from '@airnauts/comments-next'
import { memoryRepository } from '@airnauts/comments-adapter-memory'
import { mongoRepository } from '@airnauts/comments-adapter-mongo'
import { fileSystemStorage } from '@airnauts/comments-storage-fs'
import { vercelBlobStorage } from '@airnauts/comments-storage-vercel-blob'
import { join } from 'node:path'

export const { GET, POST, PATCH, OPTIONS } = createCommentsRoute({
  secretKey: 'dev-key', // demo only — replace with a real secret in production
  projectId: 'nextjs-host',
  allowedOrigins: ['http://localhost:3000', 'http://127.0.0.1:3000'],
  repository: process.env.MONGODB_URI
    ? mongoRepository({ uri: process.env.MONGODB_URI })
    : memoryRepository(),
  storage: process.env.BLOB_READ_WRITE_TOKEN
    ? vercelBlobStorage()
    : fileSystemStorage({ rootDir: join(process.cwd(), 'public', 'uploads'), baseUrl: '/uploads' }),
  rateLimit: false,
})
```

## Testing (test-first — ADR-0010)

All new behavior is backend logic, so failing tests come first (red → green →
refactor). Use `mongodb-memory-server` where Mongo is needed (already a dev dep
pattern in `adapter-mongo`).

- **`lazyRepository` (server):**
  - Lazy: constructing it does **not** call `connect`; the first method call does.
  - Memoization: with one `cacheKey`, repeated factory calls + method calls invoke
    `connect` **once** (assert via a counting fake `connect` returning a hand-rolled
    stub `Repository` — keeps the `server` test free of any adapter dep). Distinct
    `cacheKey`s call `connect` once each.
  - Forwarding: a method called through the lazy wrapper returns the underlying
    repository's result (round-trip create → get through a fake).
  - Retry: a `connect` that rejects once clears the cache so the next call retries
    and can succeed (counting fake: reject first, resolve second).
- **`memoryRepository` (adapter-memory):** returns a working `Repository` (round-trip
  create → get); two calls return independent stores (state not shared). The existing
  `InMemoryRepository` tests (and the `repositoryContract` run against it) move with
  the class into the new package, unchanged.
- **`mongoRepository` (adapter-mongo):** against `mongodb-memory-server`, a
  round-trip create → get works (proves lazy connect + `ensureIndexes` +
  delegation); repeated calls with the same `cacheKey` reuse one connection
  (assert the `globalThis.__commentsRepos` entry is a single stable promise).
  Reuse the existing `repositoryContract` against `createMongoRepository` is
  untouched; add the `mongoRepository`-specific lifecycle test separately.
- **`fileSystemStorage` / `baseUrl` (storage-fs):** with `baseUrl` set, `put`
  returns `url === \`${baseUrl}/${key}\``; without it, the existing `file://`
  round-trip (`storageContract`) still passes. The contract suite keeps using the
  no-`baseUrl` mode (its reader does `fileURLToPath`).
- **`vercelBlobStorage` (storage-vercel-blob):** the factory returns a
  `StorageAdapter`; existing `VercelBlobStorage` coverage is unchanged.
- **`createCommentsRoute` (next):** modeled on `server`'s `next.test.ts` — a
  request routed through the returned handlers round-trips create → get against a
  `memoryRepository()`-backed config (the `next` package devDepends on
  `@airnauts/comments-adapter-memory` for tests); the returned `server` is the same
  instance the handlers dispatch to.

## Example migration (proof of zero glue)

`examples/nextjs-host`:

- **Delete** `lib/mongo-repository.ts`, `lib/comments-server.ts`, and
  `lib/public-uploads-storage.ts`. The `lib/` directory holds no commenting glue
  afterward.
- **Rewrite** `app/api/comments/[...path]/route.ts` to the snippet above (existing
  `secretKey`/`projectId`/`allowedOrigins`/`rateLimit: false` values preserved).
- **Dependencies:** add `@airnauts/comments-next` and
  `@airnauts/comments-adapter-memory`; keep `@airnauts/comments-server`,
  `@airnauts/comments-adapter-mongo`, `@airnauts/comments-storage-fs`,
  `@airnauts/comments-storage-vercel-blob`, `@airnauts/comments-client`. Drop the
  example's direct `mongodb` dep (the adapter now owns it).

## ADRs

Add two records (newest-last, current date):

1. **Uniform adapter construction — one factory per adapter + the `lazyRepository`
   primitive; in-memory extracted to its own package.** Context: non-uniform
   construction and duplicated connection glue; in-memory bundled inside `server`
   while Mongo is a standalone adapter. Decision: each adapter (including in-memory)
   is its own package exposing a lowercase `xxxRepository(config)` /
   `xxxStorage(config)` factory over the existing shared interface; connection
   memoization is a single `lazyRepository` primitive in `server`; low-level
   classes/factories remain for advanced use; no monolithic driver dispatcher.
   Consequences: `mongodb` becomes a runtime dep of `adapter-mongo`; `InMemoryRepository`
   moves to `@airnauts/comments-adapter-memory` and `server` stops exporting it (a
   benign dev-only cycle remains, since server/client tests devDepend on the memory
   package); future Postgres/Redis adapters reuse `lazyRepository`; host construction
   is uniform.
2. **Next.js integration package (`@airnauts/comments-next`).** Decision: a
   Next-specific package above the framework-neutral server exposing
   `createCommentsRoute(config)` (wraps `createNextHandler`, also returns `server`);
   no env-var magic. Consequence: one more published package; one-file host
   integration.

## Alternatives considered

- **Monolithic `createRepository({ driver })` dispatcher:** one import, but imports
  every adapter → driver-dependency bloat (a Postgres app installs `mongodb`).
  Dynamic `import()` avoids the bloat but adds bundler/SSR complexity. Rejected for
  per-adapter factories.
- **`memoryRepository` as a `const` singleton:** rejected — shared mutable state
  across callers/tests; a factory is safer and matches the other adapters' shape.
- **Keep `lazyRepository` Mongo-private (inline in `mongoRepository`):** rejected —
  the memoization is framework- and driver-agnostic; extracting it into `server`
  lets Postgres/Redis reuse it and is independently testable.
- **`mongoRepository(uri: string)` (positional):** rejected for a `{ uri, cacheKey? }`
  config object, to match the uniform `xxxRepository(config)` shape and allow a
  distinct cache key per connection.
```
