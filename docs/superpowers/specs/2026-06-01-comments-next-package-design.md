# `@airnauts/comments-next` — Next.js integration package — design

- **Status:** Approved
- **Date:** 2026-06-01
- **Track:** Integration / packaging · Size: S
- **Source of truth:** [`docs/architecture.md`](../../architecture.md) §9 · [`docs/adr.md`](../../adr.md)
- **Depends on:** `@airnauts/comments-server` (`createCommentsServer`, `createNextHandler`, `InMemoryRepository`), `@airnauts/comments-adapter-mongo` (`createMongoRepository`, `ensureIndexes`)

## Goal

Collapse a Next.js App Router host's commenting integration to a **single route
file** with **minimal configuration**, while keeping a **trivial, explicit switch
between MongoDB and in-memory persistence** for local development.

Today a host copies three glue files into `examples/nextjs-host/lib/`
(`mongo-repository.ts`, `comments-server.ts`, `public-uploads-storage.ts`) and
wires them together itself. The genuinely hard-to-get-right piece — the
lazy-connecting, `globalThis`-memoized Mongo repository that survives HMR reloads
and warm serverless invocations — is the one most likely to be miscopied. This
package moves that logic behind a published seam so hosts never reproduce it.

## Non-goals

- **No env-var magic.** The package reads **no** environment variables. The
  mongo/memory decision stays in the host, expressed as an explicit ternary on the
  host's own env var. (Considered and rejected an `mongoUri?`-auto-fallback API —
  it pushes an opinion into the package; see Alternatives.)
- **No storage opinion.** `StorageAdapter` selection (Vercel Blob vs.
  local `public/uploads`) is genuinely host-specific and stays a passed-in value.
  `examples/nextjs-host/lib/public-uploads-storage.ts` does **not** move.
- **No non-Next framework glue.** This package is Next App Router specific. The
  Web-standard `Request → Response` core remains in `@airnauts/comments-server`.

## Host-facing API

The entire integration is one catch-all route file:

```ts
// app/api/comments/[...path]/route.ts
import { createCommentsRoute, mongoRepository } from '@airnauts/comments-next'
import { InMemoryRepository } from '@airnauts/comments-server'
import { storage } from '@/lib/storage' // host-specific StorageAdapter

export const { GET, POST, PATCH, OPTIONS } = createCommentsRoute({
  secretKey: process.env.COMMENTS_SECRET!,
  projectId: 'my-app',
  allowedOrigins: ['http://localhost:3000'],
  // The easy switch — explicit, host-owned, no package magic:
  repository: process.env.MONGODB_URI
    ? mongoRepository(process.env.MONGODB_URI)
    : new InMemoryRepository(),
  storage,
  rateLimit: false,
})
```

## Package surface

### `packages/next` — `@airnauts/comments-next`

Two exports.

**`createCommentsRoute(config) → { GET, POST, PATCH, OPTIONS, server }`**

- `config` is the `createCommentsServer` config verbatim:
  `{ secretKey, projectId, allowedOrigins, repository, storage, rateLimit? }`.
- Internally: `const server = createCommentsServer(config)` then
  `return { ...createNextHandler(server), server }`.
- Returning `server` is the deliberate escape hatch: hosts that need server-side
  reads, custom routes, or server access in tests get it for free, without having
  to construct the server separately. The one-file minimal path and the
  flexibility of the old "build-server-then-handler" split both hold.

**`mongoRepository(uri: string) → Repository`**

- The memoized, lazy-connecting Mongo repository, **moved verbatim** from
  `examples/nextjs-host/lib/mongo-repository.ts`. Behavior preserved exactly:
  - Synchronous construction; connects on the first repository method call so
    `createCommentsServer` can be built at module load without `await`.
  - `globalThis.__commentsRepo` memoization across HMR reloads / warm serverless
    invocations; one `MongoClient` per process, left open for the process
    lifetime; database name taken from the connection string; `ensureIndexes`
    run once on connect.
  - On connect failure, the memo is cleared so the next call retries.

Memory needs no wrapper — `InMemoryRepository` from `@airnauts/comments-server`
has no connection lifecycle, so it's used directly. The package does **not**
re-export it (the host imports it from `@airnauts/comments-server`).

### Dependencies & packaging

- **Runtime deps:** `@airnauts/comments-server` (`workspace:^`),
  `@airnauts/comments-adapter-mongo` (`workspace:^`), `mongodb`.
- Mirror the other published packages: MIT license, `publishConfig.access:
  public`, `0.0.0` version (Changesets manages the release bump),
  `exports` with `types` + `import` pointing at `dist`, `tsup && tsc --build`,
  `clean: true` in `tsup.config` (ADR-0019), `vitest run`.
- Added to the Changesets release set; published as the 7th public package.

## Testing (test-first — ADR-0010)

This is a backend package, so behavior is specified as failing tests first, then
implemented red → green → refactor.

- **`createCommentsRoute`:**
  - Returns `GET/POST/PATCH/OPTIONS` handlers plus `server`.
  - A request routed through the returned handler reaches the underlying server
    (assert via an `InMemoryRepository`-backed config — e.g. create a thread via
    POST, read it back via GET) — confirming `createNextHandler` wiring and the
    catch-all `params` path rebuild are intact.
  - `server` is the same instance the handlers dispatch to.
- **`mongoRepository`:** port the existing example coverage if any, plus pin the
  memoization contract — repeated calls reuse one connected repository, and a
  failed connect clears the memo so the next call retries. Use
  `mongodb-memory-server` (already a dev dependency in `adapter-mongo`).

## Example migration (proof of minimal config)

`examples/nextjs-host`:

- **Delete** `lib/mongo-repository.ts` (moved into the package) and
  `lib/comments-server.ts` (its env-switched wiring collapses into the route).
- **Keep** `lib/public-uploads-storage.ts` (host-specific storage).
- **Rewrite** `app/api/comments/[...path]/route.ts` to the snippet above, with the
  example's existing storage ternary (Vercel Blob vs. `publicUploadsStorage()`)
  passed as `storage`.
- Add `@airnauts/comments-next` as a dependency of the example.

The example's `secretKey`/`projectId`/`allowedOrigins` values are preserved; the
demo's env-switch behavior is reproduced by the explicit `repository` and
`storage` ternaries in the single route file.

## ADR

Add a new ADR — **"Next.js integration package (`@airnauts/comments-next`)"** —
recording: the decision to add a Next-specific package above the framework-neutral
server; that it owns the memoized lazy-connect Mongo lifecycle (a
serverless/warm-invocation concern) so hosts don't reproduce it; and the explicit
non-goal of env-var magic (the package reads no env, the host owns the
mongo/memory switch). Consequence: one more published package and a
`mongodb`/`adapter-mongo` dependency edge from the Next package, in exchange for a
one-file host integration.

## Alternatives considered

- **Thin helper only** (export `mongoRepository`, host still writes
  `comments-server.ts` + route): less new surface, but doesn't achieve "minimal
  config" — the host still hand-wires server construction.
- **`mongoUri?` auto-fallback** (package falls back to in-memory when the uri is
  absent): fewer host imports, but bakes an env-derived opinion into the package.
  Rejected in favor of the explicit host-owned ternary.
- **Fold the wrapper into `adapter-mongo`** (no new package): the memoization is
  arguably a generic serverless concern, but the "build the server synchronously
  at module load" constraint and the one-call route factory are Next-shaped, so a
  dedicated Next package is the clearer home.
```
