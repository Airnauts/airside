# Architecture Design — Embeddable Commenting Tool (v1)

- **Status:** Approved (brainstorm complete)
- **Date:** 2026-05-27
- **Inputs:** [`docs/prd.md`](prd.md) · [`docs/adr.md`](adr.md) · reference: [`docs/reference/vercel-comments-payloads.md`](reference/vercel-comments-payloads.md), [`docs/reference/vercel-widget-dom.md`](reference/vercel-widget-dom.md)
- **Scope:** the v1 system architecture. Product requirements are in the PRD; this document is the system shape that realizes them. Decision rationale is captured per-decision in `adr.md` (ADR-0001…0010); this spec is the integrated picture.

---

## 1. Decisions at a glance

| # | Decision | ADR |
|---|---|---|
| 1 | **Topology:** library-first, hosted-ready. Client talks HTTP to a configurable endpoint; integrator mounts the server in their app. Vercel/Next.js + Vercel Blob is the first-class v1 target. | ADR-0001 |
| 2 | **Widget delivery:** self-contained vanilla `init()` engine with its own bundled React + a thin `<AirsideLayer/>` React wrapper. | ADR-0002 |
| 3 | **Adapter scope:** all seams designed; minimal concretes in v1 — **MongoDB** (Atlas/Vercel), **Vercel Blob + filesystem** storage, **Next.js/Web-standard** route handler. No auth adapter. PostgreSQL repository added in ADR-0035. | ADR-0003 |
| 4 | **Anchoring:** composite fingerprint + scored re-match; element anchor with optional additive text `selection`. | ADR-0004, ADR-0008 |
| 5 | **UI stack:** shadcn/ui (Radix + Tailwind), bundled in the widget. | ADR-0005 |
| 6 | **Isolation:** **light DOM** (`all: revert` + Tailwind no-preflight + scoped prefix + portal container) — *not* Shadow DOM. | ADR-0006 |
| 7 | **API docs:** zod-first contract in `core`, OpenAPI generated from it, served via Scalar + static artifact. | ADR-0007 |
| 8 | **Data model & scoping:** Mongo document model; `projectId`(+`env`) scope from a bearer-capability secret key + origin allowlist; `pageKey` page identity. | ADR-0008 |
| 9 | **Comment scope:** page-scoped in v1; global/component scope is a designed-in seam. | ADR-0009 |
| 10 | **Backend development:** built test-first (TDD) — `core`, `server`, and the adapters; the shared contract suite doubles as the adapter conformance gate. | ADR-0010 |

---

## 2. High-level architecture

**Runtime topology.** The reviewer's browser runs the widget, which speaks only
HTTP (plus a secret-key header) to a configurable endpoint. In v1 that endpoint
is a route handler mounted inside the integrator's own app (Next.js App Router),
which uses the server core + adapters to persist to MongoDB Atlas and store
images in Vercel Blob (or the filesystem). The HTTP contract is the only coupling
between client and server, so a hosted backend can later sit behind the same
endpoint with no client change.

**Monorepo** (pnpm workspaces, tsup builds, ESM-first):

- **`@airnauts/airside-core`** — isomorphic, no DOM/Node. Types, zod schemas + the HTTP
  contract (source for OpenAPI), the anchor fingerprint schema + `schemaVersion`,
  and the pure scoring/threshold policy.
- **`@airnauts/airside-client`** — the widget engine: `init()` (vanilla, light-DOM
  mount), the React UI (shadcn), the anchoring *runtime* (DOM capture / re-match
  / overlay), and the API client. Subpath **`@airnauts/airside-client/react`** exports the
  thin `<AirsideLayer/>` wrapper (tree-shaken away if unused).
- **`@airnauts/airside-server`** — the Web-standard `Request → Response` core + business
  logic; depends only on adapter interfaces. Subpath **`@airnauts/airside-server/node`**
  is a generic Node↔Web bridge (`nodeRequestToWeb` / `webToNode`) for mounting on any
  Node server.
- **`@airnauts/airside-integration-next`** — all Next.js glue: App Router (`createAirsideAppRoute`)
  and Pages Router (`createAirsidePagesRoute`) one-call integrations.
- **`@airnauts/airside-adapter-mongo`** — MongoDB repository (only package that pulls the
  mongo driver).
- **`@airnauts/airside-adapter-postgres`** — PostgreSQL repository (hybrid columns +
  `jsonb`); driver-agnostic via a host-supplied `query()` executor, with a `pg`-based
  lazy convenience.
- **`@airnauts/airside-storage-vercel-blob`**, **`@airnauts/airside-storage-fs`** — storage
  concretes.
- **`@airnauts/airside-extension-slack`**, **`@airnauts/airside-extension-email`** —
  notification extensions (Slack Incoming Webhook; pluggable email transport) that post
  new-comment notifications.
- **`@airnauts/airside-extension-jira`** — thread-action extension: a "Create Jira issue"
  action that turns a thread into a Jira Cloud issue.
- Seams with no v1 concrete: auth, other DBs, other frameworks, S3.

**"Enable/disable via subpackage imports":** integrators install/import only the
adapters they use (so e.g. the mongo driver never enters a build that doesn't
import `@airnauts/airside-adapter-mongo`). Client features (screenshots, text anchors) are
gated in `init({ features })` and dynamically imported. **Bundle delivery is
npm-only in v1**; a CDN/script-tag build is a deliberate fast-follow.

---

## 3. Client architecture (`@airnauts/airside-client`)

**Mount.** A single call — `airside.init({ key, endpoint, pageKey?, features? })`
— injects one root host element at `<body>` (`position: fixed; inset: 0;
pointer-events: none`) and renders the widget into it in the **light DOM**, with
the widget's own bundled React. Isolation is via `all: revert` on the root,
Tailwind with preflight disabled, and a scoped class prefix; Radix portals/menus/
toasts render into a single high-z-index portal container inside the host. The
`<AirsideLayer/>` React wrapper simply calls `init()` in an effect. The widget
never reads the host's React/runtime state — it only speaks HTTP.

**Layers.** (1) an **overlay** layer rendering pin dots + text-range highlights,
absolutely positioned over the host page, with `pointer-events` only on the pins
themselves; (2) **UI chrome** — comment cursor/toolbar, thread popover, the
cross-page panel, and the email-identity modal.

**Runtime modules.**

- **activation gate** — mounts when a valid key is present in the URL
  (PRD §6.1) **or** was persisted from a prior URL activation; otherwise no-op.
  A URL activation persists the key to `localStorage` and strips the param from
  the address bar, so commenting stays on without re-supplying the param
  (ADR-0018).
- **identity** — first comment prompts for a self-asserted email; remembered in
  `localStorage` (PRD §6.1). No verification, no email sent (PRD §2).
- **capture** — turns a click/selection into a fingerprint + offset / selection +
  capture context (see §6).
- **re-match** — fast path → scored search → orphan; uses the pure policy from
  `core`.
- **positioning** — recomputes pin/highlight coordinates on scroll, resize, a
  `ResizeObserver` on the target, and a throttled `MutationObserver` (re-mount /
  SPA route change).
- **api client** — endpoint + key header; optimistic posts with rollback.

**core ↔ client split.** Pure, headless-testable logic (fingerprint schema,
scoring weights, threshold policy, HTTP contract types) lives in `@airnauts/airside-core`.
Only DOM-touching code (building fingerprints from real nodes, running the search,
rendering the overlay) lives in `@airnauts/airside-client`.

---

## 4. Server architecture (`@airnauts/airside-server`)

A framework-agnostic core built on the Web `Request → Response` standard, with
thin per-framework glue and injected adapters.

**Pipeline:** `security` (key-header check · origin allowlist · CORS) → `router`
(method + path) → `zod validate` (schemas from `core`) → `use case` → adapters →
typed JSON/error `Response`.

**Use cases:** create thread (anchor + first comment), list threads (by `pageKey`
*or* all-pages for the panel), get thread, add comment (reply), resolve/reopen,
report-orphan / refresh-anchor, upload attachment.

**Construction & adapters:**

```ts
createAirsideServer({
  repository,      // @airnauts/airside-adapter-mongo
  storage,         // vercel-blob | fs
  secretKey,
  allowedOrigins,
  pageKey?,        // URL→key rule, shared with the client
  extensions?,     // server add-ons: notifications + thread actions (see below)
  notifiers?,      // DEPRECATED alias for notification-only extensions
})
```

`Repository` and `StorageAdapter` are the only DB/IO seams.

`extensions` is a third, optional seam covering two kinds of server add-on. **Notification**
extensions (e.g. `slackExtension`, `emailExtension`) receive a `NotificationEvent`
that `createThread` / `addComment` fan out after each write, with failures isolated so they
can never break the write. **Thread-action** extensions (e.g. `jiraExtension`) contribute
reviewer-triggered actions evaluated per thread and run via
`POST /threads/:id/actions/:actionId`; an action may persist an `externalLink` back on the
thread (e.g. the created Jira issue). The older `notifiers?` option is a deprecated alias for
the notification half. See ADR-0034.

**Next.js glue is near-zero** — `@airnauts/airside-integration-next` builds the server and its
handlers in one call:

```ts
// App Router — app/api/airside/[...path]/route.ts
export const { GET, POST, PATCH, OPTIONS } = createAirsideAppRoute(config)
// Pages Router — pages/api/airside/[...path].ts
export default createAirsidePagesRoute(config)
```

Other Node hosts wrap the same core via `@airnauts/airside-server/node`.

**Security model (v1).** The secret key is a **bearer capability token, not user
auth**: one shared secret per mount, sent as the `x-airside-key` **header**
(never the query string — leaks via referrer/logs), validated server-side, paired
with a configurable **origin allowlist** so a leaked link can't post from
arbitrary sites. Basic per-key/IP rate limiting (429).

The same secret value flows through three transports: `init({ key })`
(integrator config) → the **URL parameter** the client activation gate checks
(parameter name configurable) → the **`x-airside-key` header** the server
validates. One value, three places — not three different secrets.

---

## 5. Data model (MongoDB, document-first)

**Scope.** A thread is scoped by `projectId` (+ optional `env`), resolved from the
secret key. v1 = one project per mount.

**`pageKey`** (page identity, the panel's key): default `origin + pathname`
(trailing-slash normalized, hash dropped, query excluded), overridable via
`pageKey: (url) => string` shared by client and server.

**Collections.**

`threads`:

```
{
  id,                       // nanoid, e.g. "3kXLTXxq-P9l"
  projectId, env?,          // scope
  scope: "page",            // seam: "page" | "global" (v1 always "page")
  pageKey,                  // null allowed for future global threads
  pageUrl, pageTitle?,
  anchor: { … see below },
  status: "open" | "resolved",        // independent axis
  anchorState: "anchored" | "orphaned",
  selectionLost?: boolean,            // text quote gone, pin retained
  captureContext: { viewportW, viewportH, devicePixelRatio, userAgent },
  provenance?: { commitSha, branch, deploymentId },   // supplied via init()
  createdBy: { email, name },
  createdAt, updatedAt, lastActivityAt,
  schemaVersion,
  comments: [ … embedded, soft cap ~100 … ]
}
```

`anchor` sub-document (no `type` discriminator — base element anchor always
present; `selection` additive):

```
{
  schemaVersion,
  selectors: [structuralPath, classPath],   // dual, ≈ Vercel nodeId
  signals: { tag, role?, textSnippet?, classes[], siblingIndex, ancestorTrail[] },
  offset: { fx, fy },                        // pin marker; 0,0 for a selection

  selection?: {                              // only for text ranges
    start: { selectors[], textNodeIndex, offset },
    end:   { selectors[], textNodeIndex, offset },
    quote, prefix, suffix                    // resilience add-on over positional
  }
}
```

embedded `comment`:

```
{ id, author: { email, name }, text /* plain in v1 */,
  attachments: [{ url, name, contentType, size, w?, h? }],
  createdAt, editedAt? }
```

`authors` (lightweight, keyed `(projectId, email)`): `{ id, projectId, email,
name, createdAt }` — exists so future notifications have a stable identity.

**Embedding rationale.** Comments embed in the thread (one fetch, atomic) with a
soft cap (~100); the panel paginates threads. A thread can split to its own
collection later if ever needed.

**Indexes:** `(projectId, pageKey)` (on-page load), `(projectId, updatedAt desc)`
(panel ordering), `(projectId, status)`.

---

## 6. HTTP API contract

Defined once as zod in `@airnauts/airside-core`; OpenAPI generated from it (served at
`GET /openapi.json` + a Scalar page at `/docs`; static artifact at build).
Mounted under a base path, e.g. `/api/airside`.

| Method | Path | Purpose |
|---|---|---|
| POST | `/threads` | create thread + first comment `{pageKey?, pageUrl, anchor, comment, author, captureContext, provenance?}` |
| GET | `/threads` | list — `?pageKey=` (on-page, returns anchors) **or** all-pages (panel); `?status=`, `?sort=updatedAt`, `?cursor=` → `{threads[], nextCursor}` |
| GET | `/threads/:id` | single thread + comments |
| POST | `/threads/:id/comments` | add reply `{text, attachmentIds?, author}` |
| PATCH | `/threads/:id` | resolve / reopen `{status}` |
| PATCH | `/threads/:id/anchor` | report re-match result `{selectors?, signals?, anchorState, selectionLost?}` (self-heal) |
| POST | `/uploads` | multipart image → StorageAdapter → `{id, url, name, contentType, size}` |
| GET | `/openapi.json`, `/docs` | contract + Scalar UI |

**Conventions:** `x-airside-key` header on every request; origin allowlist +
CORS; JSON; ISO-8601 timestamps; nanoid ids; cursor pagination; two-step uploads
(`POST /uploads` then reference `attachmentIds`; Vercel Blob client-upload token
is a later optimization).

**Error shape:** `{ error: { code, message, details? } }` — 400 validation (zod
details), 401 missing/invalid key, 403 origin not allowed, 404 not found, 409
conflict, 413 upload too large, 429 rate limited.

On-page load → `GET /threads?pageKey=…` → client runs scored re-match. Panel →
`GET /threads` all-pages by `updatedAt` (sole discovery surface, PRD §6.6).

---

## 7. Anchoring mechanism

Pure scoring/threshold policy in `@airnauts/airside-core`; DOM capture/search/positioning
in `@airnauts/airside-client`. All knobs have defaults and are tunable (PRD §9).

**Capture (on click / selection).** target = `elementFromPoint` (or the
selection's container); build dual `selectors` (structural nth-of-type + class
path) and the `signals` bag (tag, role, capped text snippet, class tokens, sibling
index, ancestor-landmark trail); `offset = ((clickX − rect.left)/w,
(clickY − rect.top)/h)`. For a selection, capture start/end `{selectors,
textNodeIndex, offset}` + `quote` + `prefix`/`suffix` (±~32 chars). Record
capture context (viewport, DPR, UA).

**Re-match (on load + DOM mutations).**

1. **fast path** — `querySelector(stored)`; a single hit whose signals agree →
   anchored.
2. **scored search** — scope candidates to the nearest surviving ancestor-landmark
   (else by tag), score each.
3. **decide** — `best ≥ accept (≈0.60)` **and** `lead over 2nd ≥ margin (≈0.10)`
   → anchored, then **self-heal** (rewrite the stored fingerprint via
   `PATCH /threads/:id/anchor`); otherwise / ambiguous tie → **orphaned** → panel.
4. **selection** — locate the quote (disambiguated by prefix/suffix) within the
   matched element → re-highlight; a miss → keep the element pin, set
   `selectionLost` (not orphaned).

**Scoring weights (defaults, normalized 0..1, tunable):** stable attr exact
(id/data-testid/data-*) +0.40; text-snippet similarity (Dice) +0.25; class token
overlap (Jaccard) +0.15; role +0.10; sibling-index proximity +0.05;
ancestor-trail overlap +0.05. Tag mismatch excludes a candidate. Note the numbers
and the `accept ≈ 0.60` threshold are consistent by design: a stable attribute is
the strongest single signal but, on its own (+0.40), still needs at least one
corroborating signal to clear the threshold — no single signal auto-anchors.

**Positioning:** pin = rect + offset; highlight = Range rects; recomputed on
scroll · resize · `ResizeObserver`(target) · throttled `MutationObserver`.

**Comment scope:** page-scoped (ADR-0009). On-page load fetches only the current
`pageKey`'s threads, so a shared-element (header) comment never cross-matches to
another page. Same-page duplicate elements are disambiguated by the scoring above,
not by scope.

---

## 8. Error handling

- **Host safety:** the widget is wrapped in an error boundary; a widget crash
  never propagates to the host. Light-DOM + `all: revert` prevents style breakage.
- **Anchoring:** per-thread isolation — one bad anchor can't break others; orphans
  surface in the panel, never silently dropped; a selection miss degrades to a pin
  with `selectionLost`.
- **Posting:** optimistic UI with rollback + retry; reads retry with backoff.
- **Uploads:** client + server type/size validation (413); on failure the comment
  still posts without the image.
- **Auth/validation:** bad/missing key → inert client / 401; bad origin → 403; zod
  failure → 400 with details.
- **Abuse:** basic per-key/IP rate limiting (429), given the capability-token
  model.
- **Server:** typed errors, structured logging, no PII beyond the stored emails.

---

## 9. Testing strategy

> **Integrating the widget?** See [`docs/integration.md`](integration.md) for the
> minutes-long quickstart, with `examples/nextjs-host` as the worked example.

The backend packages (`core`, `server`, adapters) are built **test-first (TDD)** —
the test/fixture precedes the code it covers (ADR-0010).

- **`core` (pure):** unit tests for fingerprint building, scoring, threshold
  decisions, `pageKey` normalization, and zod schemas.
- **★ Anchoring fixture corpus:** pairs of (original DOM → mutated DOM) with the
  expected outcome (re-anchored to X / orphaned / `selectionLost`), covering
  wrapper-added, reorder, class rename, text change, attribute change, element
  removed, and duplicate siblings — run in jsdom to calibrate and regression-guard
  the thresholds. **This is the linchpin** that turns "re-anchors reliably across
  builds" (PRD §7) into a measurable property.
- **Server:** integration tests on `mongodb-memory-server`; contract tests against
  the zod/OpenAPI schemas; security tests (key, origin allowlist, CORS).
- **Adapters:** a shared contract suite that any `Repository`/`StorageAdapter`
  implementation must pass.
- **Client:** React Testing Library component tests; positioning tests with mocked
  rects/observers.
- **e2e (Playwright):** the full loop — load with key → place pin → comment →
  reply → resolve → **reload + mutate DOM → re-anchor/orphan** → text selection →
  panel navigation, against a sample Next.js host app in `examples/`.
- **CI:** lint · typecheck · unit · integration · e2e · **widget bundle-size
  budget**.

---

## 10. Open questions (carried from PRD §9)

- **Anchoring fidelity / threshold calibration** on highly dynamic DOMs — the
  fixture corpus is the tool; defaults (§7) are starting points to tune.
- **Screenshot page-capture without an extension** — v1 is upload-only; capture
  deferred pending feasibility.
- **No notifications in v1** — the panel is the sole discovery surface; first thing
  to revisit post-v1 (email identity is already collected for it).

## 11. Out of scope / seams for later

Behind already-designed seams: a **hosted backend** (same HTTP contract), **other
DB/storage/framework adapters** (Postgres, S3, Express) and a **CDN/script-tag**
build, **auth** (magic-link / providers), **global/component comment scope**,
**rich-text body** (markdown/mentions), an optional **React-tree fingerprint
signal** (React-path only), and **Vercel Blob client-upload tokens**.
