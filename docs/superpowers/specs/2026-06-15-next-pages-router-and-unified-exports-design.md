# Next.js Pages Router handler + relocated, unified Next exports

**Date:** 2026-06-15
**Issue:** [#26](https://github.com/Airnauts/commenting-tool/issues/26) — first-class Next.js Pages Router handler in `@airnauts/comments-next`
**Status:** design approved; pending implementation plan

## Summary

Three things land together:

1. **Pages Router support** — a first-class handler so Pages Router hosts stop
   hand-writing the ~30-line Node↔Web bridge documented in the root README.
2. **Unified, renamed exports** — `@airnauts/comments-next` exposes a symmetric
   pair, `createCommentsAppRoute` (App Router) and `createCommentsPagesRoute`
   (Pages Router). The old `createCommentsRoute` is **renamed**, not aliased —
   pre-1.0, no back-compat shim.
3. **Relocation** — **all** Next.js coupling moves out of `@airnauts/comments-server`
   into `@airnauts/comments-next`. `comments-server` becomes framework-agnostic:
   the Web-standard `server.handle(Request)` plus a new **generic Node bridge**
   subpath. This reverses ADR-0021 (which placed `createNextHandler` in
   `comments-server`) and is recorded as ADR-0036.

This is a **breaking change** to both publishable packages, taken deliberately
(pre-1.0 → `minor` bump per the project's pre-1.0 policy). No deprecated shims:
`@airnauts/comments-server/next` is removed outright, and `createCommentsRoute`
is gone.

## Motivation

`@airnauts/comments-next` ships only `createCommentsRoute`, which returns App
Router handlers. Pages Router hosts must hand-bridge Node `req`/`res` ↔ Web
`Request`/`Response` (rebuild the operation-relative URL from the catch-all
segments, copy headers, stream the body, translate the `Response` back). That
boilerplate is documented but re-implemented by every Pages host.

Separately, the current layering puts a Next-named subpath
(`@airnauts/comments-server/next`) and Next catch-all knowledge inside the
framework-agnostic server runtime. Adding a *second* Next handler there would
deepen that coupling. Relocating instead aligns each package with its name:
`comments-server` knows nothing about Next; `comments-next` owns all of it.

## Package boundaries (end state)

### `@airnauts/comments-server` — framework-agnostic runtime

- **`server.handle(Request): Promise<Response>`** — the Web-standard entry
  (unchanged; the root export).
- **NEW public subpath `@airnauts/comments-server/node`** — a generic Node↔Web
  bridge, extracted from the private functions in `dev.ts`:
  - `nodeRequestToWeb(req: IncomingMessage, url: URL): Promise<Request>` — copies
    method/headers, reads the raw body, builds a Web `Request` at the **given**
    URL. The URL is supplied by the caller because URL reconstruction is
    mount-context-specific (see "Why the bridge can't be reused whole").
  - `webToNode(res: Response, nodeRes: ServerResponse): Promise<void>` — writes
    status/headers/body back to a Node response.
  - (`readBody` may be exported too if useful; otherwise internal.)
  - Consumed internally by `dev.ts`; consumable by any Node host. This is
    **groundwork** for #24 (a generic handler for non-Next hosts) — not the full
    ergonomic generic handler that issue asks for.
- **REMOVED:** the `@airnauts/comments-server/next` subpath and its
  `createNextHandler`. Hard break — **no shim is possible**, because a
  re-export would have to come from `comments-next`, which depends on
  `comments-server` (that edge would be circular).
- `dev.ts` is refactored to consume the shared bridge module rather than its own
  private copies. It builds its URL straight from `req.url` (it mounts at root).

### `@airnauts/comments-next` — all Next.js coupling

Depends on `@airnauts/comments-server` (root + the new `/node` subpath).

- **Internal:**
  - `operationUrl(segments, search, origin): URL` — pure function that rebuilds
    the mount-stripped, operation-relative URL from a catch-all's segments. The
    key test seam. Used by both handlers below.
  - The relocated handler builders.
- **Public low-level seam (kept for testability/parity):**
  - `createNextHandler(server)` → `{ GET, POST, PATCH, OPTIONS }` (App Router),
    relocated from `comments-server` and refactored to use `operationUrl`.
  - `createNextPagesHandler(server)` → `(req, res) => Promise<void>` (Pages
    Router), new.
- **Public config wrappers (the documented integration path):**
  - `createCommentsAppRoute(config & { disabled? })` → `{ GET, POST, PATCH, OPTIONS, server? }`
    — the renamed `createCommentsRoute`, behavior unchanged.
  - `createCommentsPagesRoute(config & { disabled? })` → a `(req, res)` handler
    **function with `.server` attached** (`undefined` when `disabled`).

## Handler behaviors

### App Router — `createNextHandler` / `createCommentsAppRoute`

Unchanged from today except the relocation and the shared `operationUrl`. Returns
the four named method handlers; `createCommentsAppRoute` additionally returns
`.server` and supports `disabled: true` → every handler 404s, no server built.

### Pages Router — `createNextPagesHandler` / `createCommentsPagesRoute`

`createNextPagesHandler(server)` returns an async `(req, res)` handler that:

1. **bodyParser guard.** If `req.body` is already populated, Next's body parser
   ran and consumed the stream → throw a clear error naming the required
   `export const config = { api: { bodyParser: false } }`. Fails loud instead of
   silently handing the API an empty body.
2. Builds the operation-relative URL via
   `operationUrl(req.query.path, <sliced search from req.url>, http://${host})` —
   the mount prefix (`/api/comments/...`) is **not** passed through, because the
   server core is deliberately mount-unaware.
3. `nodeRequestToWeb(req, url)` → `server.handle(request)` → `webToNode(res, …)`.

`createCommentsPagesRoute(config)`:

- `disabled: true` → returns a passthrough that sets `res.statusCode = 404` and
  ends; no server built, `.server` is `undefined`.
- Otherwise builds the server, wraps it with `createNextPagesHandler`, and
  returns the handler **function with `.server` attached** so
  `export default createCommentsPagesRoute(config)` works as the route's default
  export while SSR reads / extra routes / tests can still reach `handler.server`.

### Typing — structural, no `next` dependency

The public Pages helper types `req`/`res` against `node:http`
`IncomingMessage`/`ServerResponse` plus a minimal `{ query?: { path?: string[] | string } }`.
No `next` dependency is added (consistent with how the App Router handler avoids
`next` types). `NextApiRequest`/`NextApiResponse` are structurally assignable, so
it still "just works" for Pages users.

### Runtime

Node runtime only (the server uses `node:crypto`, `Buffer`, and Node DB drivers).
Documented, not enforced — same constraint as the App Router handler.

## Why the bridge can't be reused whole

`dev.ts`'s `nodeToWeb` builds its URL from `req.url`. That yields an
operation-relative URL only because the dev server mounts at root. In Pages
Router the handler sits at `/api/comments/[...path]`, so `req.url` is
`/api/comments/threads/abc?x=1` — passing that straight through would hand the
server `/api/comments/threads/abc`, but the server is mount-unaware ("no
basePath"). So the **body read + header copy are shared** via the bridge, while
**URL reconstruction is mount-context-specific** and is done by the caller
(`operationUrl` in `comments-next`; raw `req.url` in `dev.ts`). The bridge takes
the already-built URL as a parameter.

## Testing (TDD — `comments-server` is test-first per CLAUDE.md)

Write the failing tests/fixtures first, then implement.

- **`comments-server` (`/node` bridge):**
  - `nodeRequestToWeb` builds a `Request` at the supplied URL, copies headers,
    reads the body (and omits it for GET/HEAD).
  - `webToNode` writes status/headers/body to a fake `ServerResponse`.
  - `dev.ts` behavior is preserved (existing dev/e2e coverage continues to pass).
- **`comments-next`:**
  - `operationUrl` units — segments as array / single string / empty; with and
    without a search string.
  - `createNextHandler` (relocated) — round-trips create→get through `Request`/
    `Response` (the existing server `next.test.ts` cases move here).
  - `createNextPagesHandler` — round-trips create→get through a **fake `req`**
    (`Readable.from([...])` carrying `headers`/`method`/`url`/`query`) and a
    **fake `res`** capturing status/headers/body; verifies mount-prefix stripping
    (`req.url = /api/comments/threads/x` → server sees `/threads/x`); verifies the
    guard throws when `req.body` is set.
  - `createCommentsAppRoute` / `createCommentsPagesRoute` — round-trip, `.server`
    present, `disabled` → 404.

## Migration / call sites

- `examples/nextjs-host/app/api/comments/[...path]/route.ts` —
  `createCommentsRoute` → `createCommentsAppRoute`.
- `packages/adapter-mongo/src/integration.test.ts` — imports `createNextHandler`
  from `@airnauts/comments-server/next`; switch to importing from
  `@airnauts/comments-next` (add the dev dependency) **or** drive the test through
  `server.handle` / the dev server. Decide in the implementation plan; importing
  from `comments-next` is the smaller change.
- Docs to update for the new names and both routers:
  - `packages/next/README.md`, `docs/integration.md`, root `README.md`
    (App Router quick-start) — switch to `createCommentsAppRoute`.
  - Root `README.md` *Alternative setups → Server — Next.js Pages Router* —
    rewrite to use `createCommentsPagesRoute`; **delete** the manual ~30-line
    bridge; keep the `bodyParser: false` caveat prominent.
  - `packages/server/README.md` — drop the "framework adapters (Next.js)" claim
    from the description/keywords; document the new `/node` bridge; point Next
    users at `comments-next`.
- **Untouched:** historical `CHANGELOG.md` files, existing ADRs (other than the
  status note below), and prior specs — they are immutable history.

## Documentation of record

- **ADR-0036 — Relocate Next.js adapters into `comments-next`; `comments-server`
  exposes a generic Node bridge.** Captures: the relocation, the new public
  `/node` bridge, the removal of `@airnauts/comments-server/next`, the
  App/Pages export-pair naming, and the clean rename of `createCommentsRoute`.
  Supersedes the placement decision in ADR-0021.
- **ADR-0021** — add a status note: the Next-handler *placement* is superseded by
  ADR-0036 (do not rewrite the decision body).
- **`docs/architecture.md` §framework** — reframe: the framework-agnostic core is
  `server.handle` + the generic Node bridge in `comments-server`; the Next.js
  adapters are the headline concrete in `comments-next`.

## Delivery

- **Changeset** — `minor` bump (pre-1.0 breaking → minor), listing:
  - `@airnauts/comments-server`: **BREAKING** removed `@airnauts/comments-server/next`;
    added `@airnauts/comments-server/node`.
  - `@airnauts/comments-next`: **BREAKING** `createCommentsRoute` renamed to
    `createCommentsAppRoute`; added `createCommentsPagesRoute` (Pages Router);
    Next handlers now live here.
  - The fixed version group bumps all nine publishable packages together.
- **Release** — automatic on push to `main` (no tags), per `RELEASING.md`.

## Non-goals / YAGNI

- No ergonomic generic non-Next handler (that's #24; the `/node` bridge is only
  groundwork).
- No `basePath` option; no Edge-runtime support; no `next` dependency.
- No back-compat shims of any kind.
