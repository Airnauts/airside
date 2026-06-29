# Architecture Decision Records

Running log of architecturally significant decisions. Newest-last. To reverse a
decision, add a new record that supersedes the old one rather than editing history.

---

## ADR-0001 — Deployment topology: library-first, hosted-ready

- **Date:** 2026-05-27
- **Status:** accepted

**Context.** The tool must work on any host/framework (PRD §3 "platform
independence") yet integrate "in minutes" (PRD §2, §7). A purely self-hosted
library maximizes data ownership but raises setup cost; a purely hosted SaaS
backend minimizes setup but means we operate infra and data leaves the
integrator's environment. The architecture draft (filesystem/S3 storage,
Postgres/Mongo) implies self-hosting.

**Decision.** Ship a **self-hostable server package** with clean adapter seams.
The client widget talks HTTP to a **configurable endpoint URL** — the
integrator's own mounted handler today, an optional hosted backend later. The
same client code serves both. **Vercel + Next.js App Router route handlers +
Vercel Blob storage is the first-class v1 deployment target.**

**Consequences.**
- The client/server boundary must be a clean HTTP contract, not in-process calls.
- Storage and persistence sit behind adapter interfaces from day one (see ADR on adapter scope).
- A hosted backend can be added later with no client changes (just a different endpoint).
- Slightly more upfront design discipline on the API contract is required now.

---

## ADR-0002 — Widget delivery: self-contained engine + thin React wrapper

- **Date:** 2026-05-27
- **Status:** accepted — *isolation mechanism (Shadow DOM) superseded by ADR-0006; the delivery + own-bundled-React decision stands.*

**Context.** "Framework agnostic / works on any SPA" (PRD §3) conflicts with a
peer-dependency React component, which would couple to the host's React version
and CSS and exclude non-React hosts. But the tool's own UI is built in React, and
the primary v1 target (Vercel/Next.js) deserves ergonomic DX.

**Decision.** The core distribution is a **self-contained vanilla mount**:
`comments.init({ key, endpoint })` renders the widget into a **Shadow DOM** with
its own bundled React, lazy-loaded so it stays off the host's critical path. We
also ship a **thin `<CommentsLayer />` React wrapper** that just calls `init()`
in an effect, for the Next.js/Vercel path.

**Consequences.**
- CSS is isolated in both directions via Shadow DOM; no host style bleed.
- The widget carries its own React (~40–80kb), accepted as the cost of agnosticism; mitigated by lazy loading.
- Two documented entry points (vanilla + React wrapper) to maintain.
- The widget never touches the host's module/runtime state — it only speaks HTTP to the configured endpoint.

---

## ADR-0003 — Adapter scope for v1: seams everywhere, minimal concretes, MongoDB

- **Date:** 2026-05-27
- **Status:** accepted

**Context.** The draft lists Postgres+Mongo, filesystem+S3, magic-link+Google
auth, and several frameworks. Implementing that whole matrix in v1 contradicts
PRD §2 (auth/accounts are non-goals) and §7 (integrate in minutes; dogfood one
project). Designing seams costs little; building many concretes costs a lot.

**Decision.** Design **all adapter interfaces** up front, but ship a **minimal
concrete set** in v1:
- **Persistence:** MongoDB only, via the **MongoDB Atlas + Vercel integration**, behind a repository interface. Data model is document-oriented.
- **Storage:** `StorageAdapter` with two concretes — **Vercel Blob** (prod) and **local filesystem** (dev/self-host).
- **Framework:** `RouteAdapter` over a **Web-standard Request/Response** core; **Next.js App Router** handler is the headline concrete.
- **Auth:** no adapter in v1 (PRD has no auth). Leave a seam only.

Mongo+SQL dual support, S3, Express/other frameworks, and auth providers are
deferred behind these same interfaces.

**Consequences.**
- Going Mongo-*only* avoids the SQL-vs-document adapter trap; the document model maps cleanly to threads/replies/anchors.
- A future second DB (e.g., Postgres) is possible but explicitly out of v1 scope.
- The repository interface is shaped around document operations, not SQL joins.
- The Web-standard core means Next.js route handlers are near-zero glue; other backends get thin adapters later.

---

## ADR-0004 — Anchoring: composite fingerprint + scored re-match, element & text-range

- **Date:** 2026-05-27
- **Status:** accepted

**Context.** Resilient re-anchoring across builds is the core value (PRD §6.2,
§7). A single CSS selector is too brittle; relying solely on stable attributes
degrades silently when the app isn't instrumented. The reference UI also anchors
to **text selections** (quoted in the thread), not just clicked elements.

**Decision.** Anchors store a **composite fingerprint** of the target element —
stable attrs (if any), tag, role, text snippet, class tokens, sibling index, and
a short ancestor-landmark trail — and are re-found by **best-match scoring**
against those signals, not by one selector. Two anchor types share that base:

- **Element/point anchor:** adds a normalized offset `(fx, fy)` within the element's box; renders a pin dot.
- **Text-range anchor:** adds a W3C-Web-Annotation-style **quote + prefix/suffix** context plus a start/end position hint; re-found by locating the quote inside the re-anchored container, then re-highlighted.

**Re-match flow (on load, per thread on the page):** fast path (stored
selector/attrs resolve to one agreeing element) → scored candidate search
(weights: stable-attr > text > role > class > structure) → best ≥ threshold
re-anchors (and refreshes the fingerprint) → nothing above threshold, ambiguous
tie, or text quote not found ⇒ **"orphaned / needs review"**, surfaced in the
panel.

**Consequences.**
- More logic to design and test than a single selector; needs a tunable scoring/threshold policy (anchoring fidelity remains an open question per PRD §9).
- Both anchor types persist in one anchor schema, differentiated by a `type` field.
- Capture context (viewport size, user agent) is stored to aid re-anchoring and reproduction.
- Threshold tuning is a deliberate post-v1 calibration target against real dynamic DOMs.

---

## ADR-0005 — Widget UI stack: shadcn/ui (Radix + Tailwind) inside the Shadow DOM

- **Date:** 2026-05-27
- **Status:** accepted — *shadow-specific integration rules superseded by ADR-0006; the shadcn/Radix component choice itself stands.*

**Context.** The widget needs accessible, polished UI (popovers, dialogs,
dropdowns, tooltips) built quickly, all rendered inside the Shadow DOM so host
styles can't bleed in or out. The widget already bundles its own React.

**Decision.** Use **shadcn/ui** components (Radix primitives + Tailwind) inside
`@comments/client`, bundled with the widget. Integration rules to keep isolation
intact:
- Tailwind's generated stylesheet is **adopted into the shadow root** (constructable stylesheet), never injected at document `:root`.
- shadcn theme CSS variables are declared on **`:host`**, not `:root`.
- Every Radix **`Portal` is given a `container`** that lives inside the shadow root (Radix defaults to `document.body`, which would escape isolation and break theming/events).
- Target **Tailwind v4** (CSS-first config) for the cleanest shadow scoping.

**Consequences.**
- Fast, accessible UI; no host framework/CSS dependency (agnostic goal preserved).
- Radix + purged Tailwind CSS ship inside the widget bundle; mitigated by Tailwind purge + lazy loading.
- The portal-container wiring must be centralized (one provider) so every overlay component inherits it; getting it wrong is a class of subtle bugs.

---

## ADR-0006 — Isolation strategy: light DOM (supersedes the Shadow-DOM mechanism)

- **Date:** 2026-05-27
- **Status:** accepted

**Supersedes:** the Shadow-DOM isolation mechanism in ADR-0002 and the
shadow-specific integration rules in ADR-0005 (adopted stylesheet, `:host`
theming, in-shadow Radix portal redirect). The rest of those records stands.

**Context.** ADR-0002 chose Shadow DOM for bulletproof isolation. Captured
production DOM from Vercel Comments (`docs/reference/vercel-widget-dom.md`) shows
they isolate in the **light DOM** instead — a root element with `all: revert` and
a Tailwind build with preflight disabled. We also adopted shadcn/Radix
(ADR-0005), whose portal/focus/aria machinery is built for the light DOM and
fights a shadow root. Shadow DOM's extra robustness mainly pays off against
pathological host CSS.

**Decision.** Isolate via the **light DOM**:
- A single injected root host element with **`all: revert`** to neutralize inherited host styles.
- **Tailwind with preflight disabled** and a **scoped class prefix** so our utilities don't leak onto the host.
- A single high-z-index **`data-portal-container`** (plus a toasts container) inside the host for Radix portals / menus / toasts.

**Consequences.**
- Native fit for shadcn/Radix; no adopted-stylesheet or `:host` plumbing; simpler fonts and element measurement.
- Isolation is **not bulletproof** — host rules with high specificity, `!important`, or tag selectors can leak in. Mitigations: `all: revert` + no-preflight + prefix scoping. Revisit Shadow DOM only if a real host breaks us.
- Everything else in §2 (own bundled React, single injected host, overlay + chrome layers, positioning engine) is unchanged.

---

## ADR-0007 — API documentation: zod-first, generated OpenAPI

- **Date:** 2026-05-27
- **Status:** accepted

**Context.** The HTTP contract is the client/server boundary (ADR-0001) and
needs durable, accurate documentation during development and for the future
hosted API / non-TS consumers. Hand-written API docs drift from the
implementation.

**Decision.** The contract is defined once as **zod schemas in `@comments/core`**
(also used for runtime request validation). The **OpenAPI document is generated
from those schemas** (`zod-openapi` / `@asteasolutions/zod-to-openapi`, tool
chosen to match the Zod version). `@comments/server` serves **`GET /openapi.json`**
and an interactive docs page (**Scalar** by default; Swagger UI / Redoc are
interchangeable), and a **static `openapi.json`** is emitted at build for CI /
publishing.

**Consequences.**
- Docs and validation share one source of truth — they can't drift.
- The in-repo TS client needs no codegen (it imports core types directly); OpenAPI serves humans, non-TS consumers, and the hosted API later.
- Adds a small build/codegen step and a docs route (dev-gated or behind the key as appropriate).

---

## ADR-0008 — Data model, scoping, and the concrete anchor shape

- **Date:** 2026-05-27
- **Status:** accepted

**Context.** With MongoDB chosen (ADR-0003) and anchoring decided (ADR-0004), we
need a concrete document model, a scoping/identity rule, and a page-identity key
for the cross-page panel (PRD §6.6). The real Vercel mutation payloads
(`docs/reference/vercel-comments-payloads.md`) inform the shapes.

**Decision.**

*Scope & security.* A thread is scoped by **`projectId` (+ optional `env`)**,
resolved from the **secret key**. The key is a **bearer capability token, not user
auth** — one shared secret per mount, sent as a **request header** (never the
query string), validated server-side, and paired with a configurable **origin
allowlist**. v1 = one project per mount.

*Page identity.* Threads key on **`pageKey`**, default `origin + pathname`
(trailing-slash normalized, hash dropped, query excluded), **overridable via
`pageKey: (url) => string`** shared by client and server.

*Collections.* `threads` with **embedded `comments`** (single fetch, atomic;
**soft cap ~100**, panel paginates, documented path to split into its own
collection if ever needed); a lightweight `authors` collection keyed
`(projectId, email)` for future-notification identity. Indexes:
`(projectId, pageKey)`, `(projectId, updatedAt desc)`, `(projectId, status)`.

*Anchor shape (refines ADR-0004, no reversal).* There is **no `type`
discriminator**. Every anchor carries a **base element anchor — always**: dual
`selectors` (structural + class, ≈ Vercel `nodeId`), a `signals` bag (tag, role,
text snippet, classes, sibling index, ancestor trail), and an `offset {fx,fy}`.
A text comment **adds an optional `selection`** (start/end container selectors +
text-node index + offsets + `quote`/`prefix`/`suffix`). Re-match re-finds the
base element first; a lost selection **degrades to the element pin
(`selectionLost`)** rather than orphaning. `anchorState` ∈ {anchored, orphaned};
`status` ∈ {open, resolved} is an independent axis. Every anchor carries a
`schemaVersion`.

**Consequences.**
- Document model maps cleanly to threads/replies/anchors; embedding keeps reads atomic at the cost of the soft cap.
- Text-range comments degrade gracefully, improving resilience over a positional-only range.
- `pageKey` configurability prevents SPA query/hash routers from mis-splitting or merging threads.
- `schemaVersion` lets the fingerprint shape evolve without breaking old threads.
- The capability-token + origin-allowlist model is explicitly not authentication; real identity/roles remain post-v1 (PRD §2).

**Addendum (2026-05-28, M2b).** `Signals` grows by one optional field, `stableAttrs?: Record<string, string>`, so the §7 scoring weight of +0.40 ("stable attr exact") rides on a real signal rather than being parsed back out of the selector tuple. The change is additive: old anchors without `stableAttrs` simply contribute 0 on that axis. No `ANCHOR_SCHEMA_VERSION` bump (no live data; the parser is already forward-compatible). If the M2b calibration loop ever shifts the §7 default weights or thresholds, that warrants a second addendum recording the corpus evidence.

---

## ADR-0009 — Comment scope: page-scoped in v1, global/component as a seam

- **Date:** 2026-05-27
- **Status:** accepted

**Context.** A comment on a site-wide element (header/nav/footer) raises whether
the thread should follow that component across pages. Cross-page matching adds
ambiguity (the same selector matches on many pages) and per-page anchor-state
complexity. PRD §6.2 says each pin "records the page URL it was created on."

**Decision.** v1 is **page-scoped**: a thread is bound to its `pageKey`, and
on-page load fetches only the current page's threads — so **no cross-page
matching ever runs**. Keep **`scope` (page | global) and a nullable `pageKey`**
in the schema as a seam so global/component threads can ship post-v1 without
migration. The configurable `pageKey: (url) => string` is an escape hatch to
collapse several routes into one key. Same-page duplicate elements (e.g. repeated
cards) are disambiguated by scored re-match (sibling index, ancestor trail, text
snippet, click offset), not by scoping.

**Consequences.**
- Predictable, no accidental cross-page leakage; re-match cost stays bounded to one page.
- Shared-element feedback must be repeated per page in v1 (accepted trade-off).
- Global/component scope is a clean post-v1 addition behind the existing seam.

---

## ADR-0010 — Backend built test-first (TDD)

- **Date:** 2026-05-27
- **Status:** accepted

**Context.** The backend is the durable contract of the system: the HTTP boundary
is the only coupling between client and server (ADR-0001), the zod contract is the
single source of truth that also generates OpenAPI (ADR-0007), and the
scoring/threshold policy in `@comments/core` is a *measurable property* whose
calibration must not silently regress (architecture §9 calls its fixture corpus
"the linchpin"). Adapters must be interchangeable behind one interface (ADR-0003).
These are exactly the forces where tests-as-specification pays off: pure logic with
defined inputs/outputs, a contract that must stay honest, and behavior that needs
regression safety while thresholds are tuned.

**Decision.** Build the **backend packages test-first** — red → green → refactor,
a failing test before each unit of behavior:

- **`@comments/core`** (the prime target): zod schemas, `pageKey` normalization,
  fingerprint building, scoring weights, and threshold decisions are written
  test-first. The anchoring **fixture corpus** (§9) is authored as the executable
  spec *before* the policy it pins down.
- **`@comments/server`**: each use case and the security pipeline (key header ·
  origin allowlist · CORS · validation) gets a failing test against the
  Web-standard `Request → Response` core before implementation; integration tests
  run on `mongodb-memory-server`.
- **`@comments/adapter-mongo` and the storage adapters**: implemented against the
  **shared contract suite** (ADR-0003), which is itself written first as the spec
  every implementation must satisfy.

Client/widget testing is unchanged from architecture §9 (RTL component tests,
mocked-rect positioning tests, Playwright e2e); this record governs the backend.

**Consequences.**
- Tests are the executable spec for the boundary — together with the zod/OpenAPI
  contract, the server's behavior can't drift from what's documented.
- The threshold/scoring calibration (the §9 linchpin) gains a regression net: any
  change that moves a re-anchor/orphan/`selectionLost` outcome is caught.
- The shared contract suite does double duty — TDD spec *and* adapter conformance
  gate — so a future second DB/storage concrete is correct-by-construction.
- Slower initial velocity and upfront test-design cost, accepted as the price of a
  durable contract; mitigated because `core` is pure and cheap to test.
- The CI order already in §9 (unit → integration → e2e) is unchanged; TDD only
  fixes the authoring order — tests precede the code they cover.

---

## ADR-0011 — Monorepo tooling stack

- **Date:** 2026-05-27
- **Status:** accepted

**Context.** Architecture §2 fixed pnpm workspaces, TypeScript project
references, tsup, and ESM-first, but left the surrounding tooling open: task
orchestration, lint/format, the test runner, the bundle-size budget tool, the
module format, and version pins. `CLAUDE.md` requires an ADR when we choose a
framework or establish coding standards — this records those choices for M1.

**Decision.**
- **Task orchestration: Turborepo.** Vercel-native (matches the v1 deployment
  target, ADR-0001), dependency-aware task graph + caching across the six
  packages. `turbo.json` defines `build` · `typecheck` · `test` · `size`.
- **Lint + format: Biome.** One fast tool, one config. Its React Hooks rules
  (`useExhaustiveDependencies`, `useHookAtTopLevel`) cover the cases that matter;
  if a later frontend milestone needs a rule Biome lacks, ESLint can be added for
  the `client` package only.
- **Test runner: Vitest.** ESM-native, jsdom/RTL-ready, the TDD loop for M2+
  (ADR-0010). Each package owns a `vitest.config.ts`; Turbo fans the `test` task
  out (the deprecated `vitest.workspace.ts` file is intentionally avoided).
- **Bundle-size budget: size-limit.** Brotli budget per entry, run in CI. M1
  wires it against `@comments/client` with a placeholder limit; real budgets are
  calibrated in M9.
- **Module format: pure ESM only.** Every package is `type: module`, tsup emits
  `format: ['esm']`. No dual CJS in v1; a CJS build is a documented later seam.
- **Build-tool split.** `tsc --build` (project references, `composite`,
  `emitDeclarationOnly`) owns type-checking and `.d.ts` emit; tsup (esbuild) owns
  JS bundling (`dts: false`). They write non-overlapping outputs into one `dist/`.
- **Version pins: Node 22, pnpm 10.17.0** (`engines`, `packageManager`,
  `.node-version`/`.nvmrc`).

**Consequences.**
- A single, fast, cached toolchain; `pnpm build/test/lint` fan out across packages
  with minimal config.
- Pure ESM halves the build matrix and avoids the dual-package hazard, at the cost
  of dropping CJS consumers in v1 (accepted; seam preserved).
- The `tsc`/tsup split avoids two generators racing on `.d.ts`, but means a build
  is "complete" only after both tasks run (the root `build` script runs both).
- Biome's smaller rule ecosystem vs. ESLint is an accepted trade-off with a
  contained fallback.
- Choosing Turborepo + Biome over the heavier Nx / ESLint+Prettier stacks keeps a
  six-package repo lightweight; revisiting is cheap (these are dev-time tools, not
  runtime contracts).

---

## ADR-0012 — Contract source of truth: Zod 4 + operation table, OpenAPI via zod-openapi

- **Date:** 2026-05-27
- **Status:** accepted

**Context.** M2a freezes the HTTP contract that is the only coupling between client
and server (ADR-0001) and the single source that also generates OpenAPI (ADR-0007).
ADR-0007 deliberately left the Zod version and OpenAPI tool open ("tool chosen to
match the Zod version"). Both tracks import these schemas, so the expression of the
contract — and the way components are registered for OpenAPI — must be settled once.

**Decision.**
- **Zod 4** is the schema/validation library (native `z.toJSONSchema()` + `.meta()`
  global registry; the current default).
- **zod-openapi 5** (samchungy) generates the OpenAPI 3.1 document; entity schemas
  carry `.meta({ id })` to register as reusable components, and `createDocument`
  assembles paths from the operation table.
- The contract is expressed as **Zod schemas + a declarative `operations` table**
  (plain data referencing the schemas). One artifact drives runtime validation,
  inferred types, OpenAPI generation, and — later — M3's router; no contract
  framework is placed on the boundary.
- **Branded ID types** (`ThreadId`, `CommentId`, `AuthorId`, `AttachmentId`) via
  Zod 4 `.brand()` prevent cross-mixing id kinds across both tracks.
- A single **`KEY_HEADER_NAME`** constant (`x-comments-key`) is the shared source
  for the client header, the server check, and the OpenAPI security scheme.

**Consequences.**
- Docs, validation, types, and routing share one source and cannot drift.
- zod-openapi 5 tracks Zod 4's `.meta()`/JSON-Schema surface; both are pinned and a
  major bump is treated as a contract-review event.
- Branded ids cost a small cast at the wire boundary, paid once where raw strings
  are parsed into branded types.
- The operation table is a lightweight, framework-free convention M3 is expected
  (but not forced) to consume for routing + validation.
- zod-openapi emits a `…Output` component twin for any registered schema used in
  both a request body and a response; with no transforms in v1 these are
  structurally identical to their inputs (expected library behavior, not a defect).

---

## ADR-0013 — M3 dispatcher pattern + shared adapter contract package

- **Date:** 2026-05-28
- **Status:** accepted

**Context.** M3 implements the server side of M2a's frozen HTTP contract. Two
patterns emerged that M4 (`@comments/adapter-mongo`, Next.js glue, OpenAPI
serving) will keep building on, and that future hosted-backend / second-DB
work depends on:

1. **Router shape.** ADR-0012 already specified that the contract is expressed
   as Zod schemas + a declarative `operations` table and that "no contract
   framework is placed on the boundary." M3 needed to decide *how* the table
   becomes a runtime router.
2. **Where adapter contract suites live.** The M3 spec calls
   `Repository`/`StorageAdapter` "the only DB/IO seams" and names a shared
   contract suite. That suite is consumed by both M3 (in-memory repo + two
   storage concretes) and M4 (`@comments/adapter-mongo`), so its physical
   location is itself an architecture decision.

**Decision.**

1. **One generic dispatcher walks the `operations` table.** `compileRoutes`
   precompiles `{ op, regex, paramNames }` triples; `dispatch` matches the
   request, parses `params`/`query`/`body` through the entry's Zod schemas,
   looks up `useCases[op.operationId]`, and serializes the result at
   `op.success.status`. The constructor refuses to boot if any
   `operationId` has no matching handler, making "every endpoint exists" a
   compile-time-ish guarantee. Multipart is the one special branch
   (`body === 'multipart'`).
2. **The shared contract suite lives in a new workspace package
   `@comments/test-support`** (`private: true`, peer-dep on `vitest`). It
   exports `repositoryContract(name, makeRepo)` and `storageContract(name,
   makeStorage)`. `@comments/core` stays the wire-only layer (no server-only
   types, no vitest dep); `@comments/server` owns the `Repository` and
   `StorageAdapter` interfaces; `@comments/test-support` depends on both and
   is consumed only as a `devDependency` by the implementations under test.

**Consequences.**
- Adding an endpoint is now a one-place change (add to `operations` + supply
  a use-case); the dispatcher needs no modification.
- The "boot fails if a handler is missing" guard means refactoring the
  operation table can't accidentally drop endpoints at runtime.
- M4's Mongo adapter is gated by the same `repositoryContract` suite the
  in-memory repo passes, so a "Mongo is wire-equivalent to in-memory"
  property comes for free.
- A future hosted backend, additional DB adapter, or alternative storage
  concrete just installs `@comments/test-support` as a dev-dep and re-runs
  the suite — no duplication, no fragile cross-package test imports.
- `@comments/core` remains DOM/Node-free and free of test-only types.

---

## ADR-0014 — Widget runtime delivery: bundled-React widget + peer-React wrapper, Tailwind precompiled to a string

- **Date:** 2026-05-29
- **Status:** accepted

**Context.** M5 builds the widget runtime that realizes ADR-0002 (self-contained
vanilla mount + own bundled React + thin React wrapper), ADR-0005 (shadcn/Radix),
and ADR-0006 (light-DOM isolation). Three realization choices are hard to reverse
and shape M6–M8: how React is bundled across the two entry points, how the
widget's Tailwind CSS reaches the page, and the resulting dual-React boundary.

**Decision.**
- **Two tsup configs.** `@comments/client` (vanilla `comments.init()`) bundles its
  **own React** and all UI deps into `dist/index.js` — host-agnostic.
  `@comments/client/react` (`<CommentsLayer/>`) marks `react`/`react-dom`
  **external** (the host's React) and references the sibling widget bundle at
  runtime, so there is exactly one widget implementation. This is the **dual-React
  boundary**: the wrapper's own hooks run on host React; the widget renders its own
  React tree via a separate `createRoot`. They never share a tree, so two React
  instances coexist safely. The wrapper's secret prop is `commentsKey` (React
  reserves `key`).
- **No code-splitting in M5.** `init()` keeps an **async signature** (so a future
  lazy-download split can land without an API break), but the app + React are
  statically bundled. The activation gate still makes the widget **inert** (never
  mounts, renders, or fetches) when the URL key is absent. Splitting for download
  savings is deferred to when bundle size is calibrated (M9).
- **Tailwind v4 precompiled to a string.** A `build:css` step runs the Tailwind CLI
  on a no-preflight, `cmnt`-prefixed entry and inlines the output into a generated
  `.ts` module (`export const widgetCss`). `mount()` injects it into a `<style>` in
  the light-DOM host root. A plain `.ts` string module resolves identically in the
  tsup build and the jsdom tests — no esbuild/vitest CSS-loader config in two
  places. The `cmnt:` prefix prevents our injected utilities (which live in the
  host's light DOM) from styling host elements.

**Consequences.**
- Host-framework-agnostic vanilla widget and an ergonomic React wrapper, with no
  "invalid hook call" risk from mixed React instances.
- The generated CSS module is git-ignored and produced ahead of `tsup`/`tsc`/
  `vitest`; running tests/builds requires the Tailwind dev dependency.
- Bundle size is intentionally unoptimized in M5 (no split, widget carries React);
  this is an accepted, documented deferral, not a regression.
- Re-introducing a lazy-download split later is non-breaking because `init()` is
  already async.

---

## ADR-0015 — M4 deployment glue: Next.js path mapping & v1 OpenAPI delivery

- **Date:** 2026-05-29
- **Status:** accepted; `createNextHandler` placement superseded by ADR-0036

**Context.** M4 mounts the M3 server core on the v1 target stack. Two boundary
choices are architecturally significant because integrators and future adapters
build on them: (1) how a request under a mount prefix (`/api/comments/…`) reaches
the dispatcher, which matches **bare** operation paths (`^/threads$`, no prefix
stripping); and (2) how the OpenAPI contract (ADR-0007) is delivered in v1.
Architecture §6 and ADR-0007 anticipated serving `GET /openapi.json` + a Scalar
`/docs` page; M4 decides whether to build that now.

**Decision.**

1. **The Next.js mount maps the path from the catch-all, not a configured base
   path.** `createNextHandler(server)` (in `@comments/server/next`) reconstructs
   the operation-relative path from Next's `[...path]` segments, rebuilds the Web
   `Request`, and calls `server.handle`. The mount is zero-config and
   location-agnostic — the integrator's whole glue is
   `export const { GET, POST, PATCH, OPTIONS } = createNextHandler(server)`. A
   `basePath` option on `createCommentsServer` is left as a documented seam for
   non-catch-all / other-framework adapters (e.g. Express) and is **not** built in
   v1 (YAGNI).
2. **v1 ships the static `openapi.json` artifact only.** `core`'s existing
   `emit:openapi` is wired into the build so CI publishes `core/dist/openapi.json`.
   Runtime `GET /openapi.json` and the Scalar `/docs` page are **deferred** behind
   ADR-0007's seam: no v1 consumer needs a live endpoint (the in-repo TS client
   imports `core` types directly), and a browser hitting `/docs` sends no
   capability key, so gating it is self-defeating while serving it publicly adds
   surface for no v1 benefit. This narrows the M4 exit criteria in
   `docs/milestones.md`.

**Consequences.**
- Integrators mount with one line and never configure a base path; the core stays
  unaware of its mount location.
- The glue couples to Next's catch-all convention and the Web `Request` contract;
  it `await`s `params` so it is correct on both Next 14 (sync) and Next 15 (async
  params). No `next` package dependency is added.
- The OpenAPI contract ships as a build artifact for CI/publishing and future
  non-TS consumers; enabling live serving + Scalar later is additive and touches
  only `@comments/server` (the seam is unchanged).
- The MongoDB document model needs no new record — ADR-0008 already decided it; M4
  implements it behind the `Repository` interface.

## ADR-0016 — Exclude the TypeScript `.tsbuildinfo` from Turborepo's cached build outputs

- **Date:** 2026-06-01
- **Status:** accepted

**Context.** Every package builds with `tsup` (JS) + `tsc --build` (declarations
only; `composite`/`incremental`, `emitDeclarationOnly`, `tsBuildInfoFile:
dist/.tsbuildinfo`). Consumers depend on each other through TS **project
references** (e.g. `@comments/client` references `../core`) and resolve a workspace
dep to its built `dist/index.d.ts`. Turbo cached `build` outputs as `["dist/**"]`,
which **included `dist/.tsbuildinfo`** — TypeScript's incremental-build *state* file.

A recurring build failure resulted: `pnpm build` after a consumer change reported
`TS7016 — Could not find a declaration file for '@comments/core'` (×26), and `rm -rf
dist` was the only known workaround. Root cause (verified empirically): a turbo
cache **hit** for an upstream package (e.g. `core`) restored its `dist/.tsbuildinfo`
— which asserts "declarations already emitted, project up-to-date" — alongside a
cached `dist` that lacked the `.d.ts`. When a downstream package then ran `tsc
--build` (cache miss), the project-references build read the restored buildinfo,
concluded the upstream was up-to-date, and **skipped regenerating the missing
`.d.ts`**. The incomplete `dist` got re-cached, making the breakage self-perpetuate.
Caching an incremental *state* file as a build *artifact* is the anti-pattern.

**Decision.** Exclude the buildinfo from every cached `build` output:
`"outputs": ["dist/**", "!dist/**/*.tsbuildinfo"]` (the generic `build` task plus the
package-scoped `@comments/server#build` / `@comments/test-support#build`). The
buildinfo stays at `dist/.tsbuildinfo` (so a local `rm -rf dist` still clears it,
keeping the incremental state consistent with the emitted files) but is never
captured or restored by the cache.

**Consequences.**
- A cache hit restores only real artifacts (`.js`, `.d.ts`, `.js.map`, `openapi.json`),
  never a stale "up-to-date" signal. A downstream `tsc --build` therefore always sees
  the upstream as needing verification and regenerates any missing `.d.ts` — the
  `TS7016`/`rm -rf dist` loop is gone. Verified: wiping `core/dist` then rebuilding
  restores `index.d.ts` (not the buildinfo), and the exact failing combination
  (`core` cache hit + `client` cache miss) now builds clean.
- Editing `outputs` changes the turbo task hash, so the first build after this change
  is a full rebuild that re-populates clean cache entries; no manual cache purge is
  required going forward.
- Incremental compilation still works locally (the buildinfo persists in `dist`); only
  cross-cache restoration of the state file is removed. Negligible cost — these
  packages build in milliseconds.
- Applies repo-wide; all packages already place the buildinfo at `dist/.tsbuildinfo`,
  and the `!dist/**/*.tsbuildinfo` glob also covers any default-named buildinfo.

## ADR-0017 — Same-origin Origin policy: allow absent Origin, reject only present-and-disallowed

- **Date:** 2026-06-01
- **Status:** Accepted

**Context.** `checkOrigin` rejected a request whose `Origin` header was absent or not
in `allowedOrigins`. The absent-Origin rejection assumed every caller is a
cross-origin browser widget (which always sends `Origin`). M9's `createNextHandler`
host app mounts the API **same-origin**, and per the Fetch spec browsers omit
`Origin` on same-origin GET/HEAD — so the widget's `listThreads`/`getThread` 403'd on
page load. This is the first time the same-origin mount topology was exercised
end-to-end.

**Decision.** `checkOrigin` rejects only a **present-and-disallowed** `Origin`. An
**absent** `Origin` (same-origin GET/HEAD, or a non-browser caller) is allowed; the
capability key (`checkKey`) remains the authentication gate. A present cross-origin
`Origin` not in `allowedOrigins` is still rejected, preserving the block on
unapproved cross-site embedding. `checkOrigin` now returns `string | null`.

**Consequences.** Same-origin Next mounts work without weakening the meaningful CSRF
signal: a browser cannot omit or forge `Origin` on a cross-origin state-changing
request, so present-and-disallowed is what matters; absent is benign. Reads are no
longer origin-gated when same-origin (acceptable — the key gates them). Supersedes
the implicit "missing Origin → 403" behavior previously asserted in
`security.test.ts`. CORS preflight handling (`preflightResponse`) is unchanged.

## ADR-0018 — Persist the activation key and strip the URL param after first activation

- **Date:** 2026-06-01
- **Status:** Accepted

**Context.** The activation gate (`isActivated`) mounted the widget only while
`?comments-key=<key>` was present in the URL, re-checked on every load. A reviewer
who wanted commenting on had to keep the param in the address bar across every
navigation — it leaked into shared links, broke on internal links that drop the
query string, and cluttered the URL. Identity (email/name) was already remembered in
`localStorage` (`comments:identity`); activation was the one piece of state that
wasn't sticky.

**Decision.** On a URL activation (param present and equal to the init key), `init()`
persists the key to `localStorage` under `comments:key` and strips the param from the
address bar via `history.replaceState` (preserving all other params and the hash).
The gate now activates when the URL param **or** the persisted key matches the init
key; `isActivated` stays pure (storage is read in `init()` and passed in as
`storedKey`). The stored value is the **key itself**, not a boolean — activation from
storage re-checks `storedKey === options.key`, so rotating the integrator's key
invalidates stale activations. A separate one-time `isUrlActivation` predicate gates
the persist-and-strip side effects so they fire only on the URL path, never when
activating from storage (idempotent under React strict-mode double-invoke).

**Consequences.** Commenting stays available across visits and navigations without
re-supplying the param, and the param no longer lingers in shared/bookmarked URLs.
The capability key is now stored client-side in plaintext `localStorage` — acceptable
for v1 (it is a shared dev/reviewer capability, already exposed in the URL and in the
client bundle config, and gates only commenting). Clearing site data or rotating the
key deactivates the widget. `GateInput` gains an optional `storedKey`; `replaceState`
(not `pushState`/reload) keeps activation flash-free and out of Back history.

## ADR-0019 — Clean the whole `dist` before each build so `tsc` always re-emits declarations

- **Date:** 2026-06-01
- **Status:** accepted (extends [ADR-0016](#adr-0016--exclude-the-typescript-tsbuildinfo-from-turborepos-cached-build-outputs))

**Context.** ADR-0016 fixed a `TS7016 — Could not find a declaration file for
'@comments/core'` (×26) loop by excluding `dist/.tsbuildinfo` from turbo's cached
outputs. That removed *one* desync vector (a cached "up-to-date" buildinfo restored
without its `.d.ts`), but was **necessary-but-insufficient** — the same failure
recurred the same day. The remaining vector is a package's *own* build: each backend
package runs `tsup && tsc --build`, where `tsc` is `composite`/`incremental`,
`emitDeclarationOnly`, with `tsBuildInfoFile: dist/.tsbuildinfo`. `tsup`'s `clean`
was a **narrow glob** (`['dist/**/*.js', 'dist/**/*.js.map']`) that deleted only the
JS, never the buildinfo. So a stale on-disk `dist/.tsbuildinfo` — left behind by a
prior run and never managed by the cache (it is excluded per 0016), never wiped by
`tsup` — told `tsc --build` "declarations already emitted", and `tsc` emitted **no
`.d.ts`**. Turbo then cached that declaration-less `dist`; every cache hit replayed
it, re-poisoning consumers. ADR-0016's verification (`rm -rf dist` then rebuild) hid
this: deleting `dist` also deletes the buildinfo, so that path can never reproduce
the bug — the failing path is **cache hit + partial clean**, which a full `dist` wipe
never exercises.

**Decision.** Set `clean: true` in every backend package's `tsup.config.ts` (`core`,
`server`, `test-support`, `storage-fs`, `storage-vercel-blob`, `adapter-mongo`).
Because `tsup` runs first in the `tsup && tsc --build [&& tsx …]` chain, cleaning the
whole `dist` (including the stale `.tsbuildinfo` and any old `.d.ts`) before `tsc`
runs forces a full declaration rebuild on every real (cache-miss) build; `tsc` and
the openapi step re-emit their outputs immediately after. The buildinfo is therefore
always consistent with the emitted `.d.ts` — it cannot survive into a build that
skips emit. Rejected alternative: moving `tsBuildInfoFile` outside `dist` — that is
the same desync reversed (the buildinfo would survive a `dist` wipe and still skip
emit).

**Consequences.**
- A real build can no longer emit JS-without-declarations, so the cache can never be
  poisoned with a declaration-less `dist`. The `TS7016`/`rm -rf dist` loop is closed
  at its source. Verified on the *previously-broken* path (not `rm -rf dist`): wipe
  all `dist` + the turbo cache → `pnpm build` (0 cached) → `pnpm build` again (8
  cached, cache-hit replay) keeps every `dist/index.d.ts`; and the exact 0016 combo
  (`core` cache hit + `client` cache miss) builds clean.
- Editing each `tsup.config.ts` rehashes the turbo `build` task, so the poisoned
  cache entries invalidate naturally — no manual purge needed.
- `tsc` incremental state is reset on each real build, so cross-package builds full-
  rebuild declarations every cache miss. Negligible — these packages build in
  milliseconds and cache hits still skip the work entirely.

## ADR-0020 — Publish the packages to npm under the `@airnauts` scope (MIT), released with Changesets

- **Date:** 2026-06-01
- **Status:** accepted

**Context.** The packages were authored as a private workspace: every manifest was
`"private": true` at version `0.0.0` under the internal `@comments/*` scope, which is
not an npm org anyone owns. To distribute v1 we must (a) publish under a scope owned
by the Airnauts npm account, (b) attach a license and the metadata npm expects, and
(c) choose a repeatable, multi-package release process. The `@comments/*` name was
referenced by name in 100+ source files, `turbo.json` task keys, and
`scripts/check-exports.mjs`, so the scope is not free to change later without another
sweep — a hard-to-reverse, architecturally significant decision.

**Decision.**
- **Scope & naming.** Rename every package from `@comments/<x>` to
  `@airnauts/comments-<x>` (a single `@comments/` → `@airnauts/comments-`
  substitution that also rewrites subpath exports, `workspace:*` deps, turbo task
  keys, and the export-check list). The `comments-` product prefix keeps the names
  from colliding with future Airnauts libraries in the shared scope.
- **Public set.** Publish the six runtime packages (`core`, `server`, `client`,
  `storage-fs`, `storage-vercel-blob`, `adapter-mongo`) with
  `"publishConfig": { "access": "public" }`. `@airnauts/comments-test-support` stays
  `"private": true` (dev-only contract suite); the `examples/*` apps stay private.
- **License.** MIT — a root `LICENSE` plus a copy in each published package.
- **Client React deps.** Move `react`/`react-dom` from `dependencies` to **optional**
  `peerDependencies` on `@airnauts/comments-client`. The vanilla widget bundles its
  own React (`noExternal`), but the `./react` wrapper externalizes React and uses the
  host's copy; shipping React as a hard dependency would risk a duplicate-React
  "invalid hook call" in consumer apps. They remain in `devDependencies` so the
  workspace build/tests still resolve them.
- **Release process.** Adopt [Changesets](https://github.com/changesets/changesets)
  (`access: public`, `baseBranch: main`): `pnpm changeset` to record intent,
  `pnpm changeset version` to bump + write changelogs + update internal dep ranges,
  and `pnpm release` (`pnpm build && changeset publish`) to build then publish in
  dependency order. `pnpm`/Changesets rewrite `workspace:*` to real ranges at pack
  time; the `release` script guarantees a fresh build (incl. the client's generated
  CSS, which is inlined into `dist`) precedes every publish.

**Consequences.**
- First release is `0.1.0` for all six packages (an initial minor changeset bumps
  them from `0.0.0`). Versioning is independent thereafter, with internal dependents
  receiving a patch bump when a dependency changes (`updateInternalDependencies`).
- The scope/name is effectively permanent once published — npm versions cannot be
  re-pointed and unpublish is restricted — so a future scope change means a new name
  and a deprecation of the old one, not a rename.
- Consumers of the `./react` entry must provide React 19 themselves; vanilla-widget
  consumers are unaffected (optional peer ⇒ no install warning).
- This ADR records strategy only. Authenticating to npm and running `pnpm release`
  remain manual, deliberate steps performed by a maintainer.

## ADR-0021 — Uniform adapter construction: one factory per adapter + the `lazyRepository` primitive; in-memory extracted to its own package

- **Status:** accepted
- **Date:** 2026-06-02

**Context.** The `Repository` and `StorageAdapter` interfaces are already uniform
(each enforced by a shared contract suite), but *construction* was not:
`new InMemoryRepository()` vs. `createMongoRepository({ db })` vs. hand-written host
glue that owned a `MongoClient` and memoized it. The memoization is not Mongo- or
Next-specific — any lazily-connecting backend (Postgres, Redis) needs the same
warm-serverless / HMR connection reuse. In-memory lived inside `server` while Mongo
was a standalone adapter.

**Decision.** Each adapter — including in-memory — is its own package exposing a
lowercase `xxxRepository(config)` / `xxxStorage(config)` factory over the existing
shared interface. Connection memoization is a single generic `lazyRepository(connect,
{ cacheKey })` primitive in `@airnauts/comments-server` (a `globalThis` registry keyed
by `cacheKey`, retry-on-failure). `mongoRepository({ uri })` is built on it;
`InMemoryRepository` moves to `@airnauts/comments-adapter-memory` and `server` stops
exporting it. Low-level constructs (`InMemoryRepository`, `createMongoRepository`,
`FileSystemStorage`, `VercelBlobStorage`) remain exported for advanced use. No
monolithic `createRepository({ driver })` dispatcher (it would force every driver
dependency into one module).

**Consequences.** Host construction is uniform; future Postgres/Redis adapters reuse
`lazyRepository`. `server` becomes a pure engine that depends on no concrete adapter.
A benign dev-only workspace cycle remains: `server`/`client` tests devDepend on
`@airnauts/comments-adapter-memory`, which depends on `server` — acyclic for
`tsc --build` (server's non-test build never imports memory) and allowed by pnpm.
`@airnauts/comments-adapter-memory` is a new published package.

## ADR-0022 — Next.js integration package (`@airnauts/comments-next`)

- **Status:** accepted; `createCommentsRoute` renamed to `createCommentsAppRoute` by ADR-0036
- **Date:** 2026-06-02

**Context.** Mounting the commenting server on Next App Router required hosts to
hand-wire `createCommentsServer` + `createNextHandler` plus repository/storage
construction across several `lib/` files. The only genuinely Next-shaped piece is the
route-handler wiring.

**Decision.** Add `@airnauts/comments-next` exposing `createCommentsRoute(config)`,
which builds the server and wraps it with the existing `createNextHandler`, returning
`{ GET, POST, PATCH, OPTIONS, server }`. The package reads no environment variables;
the mongo/memory and blob/fs switches stay host-owned in the single route file.

**Consequences.** A Next host integrates in one route file with no bespoke glue.
`@airnauts/comments-next` is a new published package; the example `nextjs-host` is
reduced to that one route file.

## ADR-0023 — Force declaration emit with `tsc --build --force` (tsup `clean` does not delete `.tsbuildinfo`)

- **Date:** 2026-06-02
- **Status:** accepted (supersedes [ADR-0019](#adr-0019--clean-the-whole-dist-before-each-build-so-tsc-always-re-emits-declarations))

**Context.** ADR-0019 set `clean: true` in every backend `tsup.config.ts` on the
premise that tsup, running first in `tsup && tsc --build`, would wipe the whole
`dist` — *including* the stale `dist/.tsbuildinfo` — so `tsc --build` would always
full-rebuild and re-emit `.d.ts`. That premise is false for tsup v8.5.1: its `clean`
deletes the emitted `.js`/`.d.ts` but **leaves the dotfile `.tsbuildinfo` in place**
(verified — a `tsup`-only run left the buildinfo's mtime unchanged while removing all
`.d.ts`). So the exact desync ADR-0019 claimed to close survived: a stale
`.tsbuildinfo` — never cached (excluded per ADR-0016), never wiped by `tsup` — tells
`tsc --build` "declarations already emitted", `tsc` emits **no `.d.ts`**, and the
declaration-less `dist` is what gets cached and replayed. The bug resurfaced when a
host build failed with `'@airnauts/comments-adapter-mongo' has no exported member
'mongoRepository'` (and the same for `fileSystemStorage`, `createCommentsRoute`, the
`@airnauts/comments-server/next` subpath) — every consumer of a package whose `.d.ts`
had been silently dropped. ADR-0019's verification missed it because it only checked
the cache-*hit* replay of an already-correct `dist`, never a build whose `tsc` step
ran against a surviving stale buildinfo.

**Decision.** Change the declaration step from `tsc --build` to `tsc --build --force`
in every package whose build emits declarations (`core`, `server`, `test-support`,
`client`, `next`, `adapter-memory`, `adapter-mongo`, `storage-fs`,
`storage-vercel-blob`). `--force` makes `tsc` ignore `.tsbuildinfo` entirely and
rebuild + re-emit `.d.ts` on every real (cache-miss) build, regardless of any stale
on-disk buildinfo. This does not depend on tsup's clean behavior at all. The
`clean: true` settings from ADR-0019 are kept (harmless, and they still remove stale
`.js`/`.d.ts`), but correctness no longer rests on them deleting the buildinfo.
Rejected alternative: `rm -f dist/.tsbuildinfo` before `tsc` — works, but is one more
shell step and not better than letting `tsc` itself ignore the file.

**Consequences.**
- A real build can no longer emit JS-without-declarations: `tsc --build --force`
  always emits, so the cache can never be poisoned with a declaration-less `dist`.
- Verified on **both** paths (the discriminating check ADR-0019 skipped): `pnpm build`
  with the script change → 10 tasks, 0 cached (full rebuild, host included, green);
  immediate re-run → 10 cached (cache-hit replay) with every `dist/index.d.ts` and
  subpath `.d.ts` present and exporting the expected factories.
- Editing each `package.json` build script rehashes the turbo `build` task, so the
  poisoned cache entries invalidate naturally — no manual purge needed.
- `tsc` incremental state is unused on real builds. Negligible — these packages build
  in milliseconds and cache hits still skip the work entirely.

## ADR-0024 — Complete two-step attachment uploads: persist attachment metadata in the repository and resolve `attachmentIds` server-side; allow image-only comments

- **Date:** 2026-06-02
- **Status:** accepted

**Context.** Architecture §6 specifies two-step uploads: the client `POST`s an image to
`/uploads`, gets back an `Attachment { id, url, name, contentType, size }`, then
references that id via `attachmentIds` when creating a thread or reply. Only the first
half existed. `uploadAttachment` stored the blob via the `StorageAdapter` and minted an
id, but persisted **nothing** keyed by that id — the `StorageAdapter` is blob-only
(`put → { url, key, size }`) and the `Repository` had no attachment methods. So
`addComment`/`createThread` had no way to turn an `attachmentId` back into an
`Attachment`; both hardcoded `attachments: []` and silently dropped the reference. Three
user-visible symptoms followed: (1) no preview after upload, (2) the composer's Send
button was disabled unless text was present — and the request schemas enforced
`text.min(1)` — so an image alone could never be sent, and (3) when text *and* an image
were sent, the image never appeared on the saved comment. (1) is a pure client bug; (2)
and (3) were the unbuilt half of the documented design. The fork was whether to build the
documented id-based persistence (server resolves ids) or reverse it so the client sends
full `Attachment` objects it already holds. The latter is a smaller diff but reverses a
documented decision and makes the server trust client-supplied `url`/`size`/`contentType`
(a client could point the rendered `<img>` at an arbitrary URL).

**Decision.** Complete the documented design rather than reverse it.

- Add two methods to the `Repository` contract: `putAttachment(scope, attachment)` and
  `getAttachments(scope, ids) → Attachment[]` (returns only the ids that exist; order
  unspecified). They are scoped by `(projectId, env)` exactly like threads, and are part
  of the shared adapter contract suite so both `adapter-memory` and `adapter-mongo` are
  covered test-first. Mongo stores them in a dedicated `attachments` collection keyed by
  `_id`; memory keeps a `Map`.
- `uploadAttachment` now persists the `Attachment` under the request scope after storing
  the blob (its deps gain `repo`; wired in `createCommentsServer`). `lazyRepository`
  forwards the two new methods.
- A shared `resolveAttachments(repo, scope, ids)` helper resolves the referenced ids in
  request order and throws `ValidationError` (HTTP 400) if **any** id is unknown — a clean
  failure beats silently dropping the user's image. `addComment` and `createThread` call
  it and set the result on the comment.
- Allow image-only comments: `AddCommentBody` and `CreateThreadBody.comment` drop
  `text.min(1)` for `z.string()` plus a refine requiring non-blank text **or** at least one
  attachment. The composer's `canSend` mirrors this (a ready attachment is sufficient).
- Client preview (symptom 1): the composer creates an object URL at file-pick time and
  passes it to `PendingAttachment` (which already supported `previewUrl`), revoking it on
  remove, send, replace, and unmount.

**Consequences.**
- Faithful to architecture §6; the client keeps sending opaque `attachmentIds` and the
  server remains the authority on attachment metadata (no client-supplied URLs trusted).
  No prior ADR is superseded — this fills a gap.
- New persisted state: attachment metadata now lives in the repository, separate from the
  blob in storage. Orphaned attachments (uploaded but never referenced by a comment) are a
  v1-accepted leak under either design — blobs already orphan in storage; GC is deferred.
- `Repository` implementers must now provide the two methods; the contract suite enforces
  it. Verified end-to-end through the real server handler (`pipeline.test.ts`): multipart
  upload → image-only comment referencing the returned id → fetched thread carries the
  resolved attachment; an unknown id returns 400.

---

## ADR-0025 — Emit the widget's utilities un-layered so a host's reset can't override them (amends ADR-0006)

- **Date:** 2026-06-03
- **Status:** accepted

**Amends:** ADR-0006 (light-DOM isolation). That record already noted isolation is
"not bulletproof — host rules with … tag selectors can leak in"; this fills the
specific, *common* case it under-weighted.

**Context.** The first real host integration (lear-frontend, a Tailwind v3 app)
showed the widget's buttons rendering with no borders, radii, or padding. Root
cause is a **CSS cascade-layer** conflict, not specificity. The widget's
`widget.css` imported its utilities into a named layer
(`@import "tailwindcss/utilities.css" layer(utilities) …`), so every utility lived
in `@layer utilities`. The host ships an **un-layered** reset/Preflight — Tailwind
v3 flattens `@tailwind base` to plain un-layered CSS, as do Normalize/reset.css and
most hosts. Per the CSS cascade, **a normal un-layered author declaration beats any
normal *layered* author declaration regardless of selector specificity.** So the
host's un-layered `button { border-radius: 0; padding: 0 }` and
`*,::before,::after { border: 0 solid … }` defeated the widget's higher-specificity
`.cmnt\:rounded-full` / `.cmnt\:border-2` / `.cmnt\:p-3` — stripping exactly the
properties the host reset touches while leaving colors/layout intact (the observed
partial-styling symptom). `all: revert` on the root never addressed this: it
neutralizes the root element only, not descendants, and cannot out-rank an
un-layered host rule.

**Decision.** Emit the widget's `cmnt:`-prefixed utilities **un-layered** (drop
`layer(utilities)` from the `@import` in `widget.css`). Because every utility is
`cmnt:`-prefixed it can only match elements inside our root, so un-layering carries
**no leak risk**; meanwhile its `.cmnt\:…` selectors (specificity 0,1,0) now win
over a host's element/universal reset (≤ 0,0,1). Theme variables and our scoped
`@layer base` resets stay layered (and therefore below the utilities), preserving
the intended theme < base < utilities ordering. Preflight remains un-imported
(ADR-0006). Shadow DOM is still rejected.

**Consequences.**
- Robust against the *normal-declaration* reset every real host ships; verified in a
  real browser against lear (host control `<button>` → `0` radius/padding while the
  widget's `comments-place`/`comments-panel-open` buttons keep their pill radius and
  padding under the identical host reset, with no leak onto the host button).
- Still **not** bulletproof against a host that resets with `!important` (important
  beats normal regardless of layer) — out of scope; revisit only if a real host hits
  it. Scoped `!important` on utilities was rejected here because the pin positioning
  sets dynamic inline `transform`, which `!important` utilities would override.
- Guarded by a build-output unit test (`widget-css.test.ts`) asserting the generated
  CSS contains the utilities but no `@layer utilities` wrapper, so the layer can't be
  silently reintroduced.

---

## ADR-0026 — Verification milestone: Playwright e2e (Chromium, hermetic) + publish-on-green-main (Changesets); drive the widget via user-facing locators

- **Date:** 2026-06-03
- **Status:** accepted

**Context.** M10 had to automate the manual smoke checklist M9 produced and give the
already-prepared `@airnauts/comments-*` packages a way to ship. Forces: keep CI
hermetic and fast (no external services); honor M10's "no package-code" scope; make
releases routine rather than a manual ceremony; and prove the riskiest behavior
(re-anchoring across reload + DOM mutation) end to end in a real browser.

**Decision.**
- **Playwright e2e** drives `examples/nextjs-host` in **Chromium only**, against a
  **hermetic** host app (no `MONGODB_URI`/`BLOB_READ_WRITE_TOKEN` → in-memory repository
  + local `public/uploads/`). The webServer runs a production build + `next start`.
  DOM-mutation re-anchor/orphan is exercised by a server-rendered `?variant=` surface on
  the article page (test-support only).
- **Per-test store isolation** via a `?ns=` namespace honored by the host mount's
  `pageKey` override — the single in-memory store is shared across tests, so each test
  partitions its threads (the cross-page panel is inherently cross-`pageKey`, so its
  test asserts on `/pricing`, a page no other spec uses, rather than a total count).
- The widget is driven through **user-facing locators** (`getByRole`/`getByLabel`/
  `getByText`) plus the widget's **existing** `data-testid` hooks — **no new test hooks
  or any other widget source change**, keeping the "no package-code" scope honest and
  earning accessibility coverage.
- **Publish on green `main`**: a `publish` job in `ci.yml` runs on every push to `main`,
  `needs: [ci, e2e]`, then `changeset publish`. `changeset publish` is idempotent
  (publishes only versions not yet on npm), so non-bump pushes are no-ops and a release is
  simply "land a version bump on `main`". Gating on `ci + e2e` means nothing ships until
  the full quality bar (including the e2e suite) is green; versioning stays manual via
  `changeset version`. (Chosen over a tag-triggered `release.yml`, which wouldn't run e2e
  before publishing and duplicated the gates.)

**Consequences.**
- Cross-browser e2e (Firefox/WebKit), a Mongo-backed e2e, and the live **Vercel + Atlas
  + Blob** dogfood deployment + real-project adoption are **deferred to M11**; PRD §7's
  adoption bar lands there, not here.
- Releasing is just landing a version bump on `main` (no auto "Version PR", no tags);
  `NPM_TOKEN` must be configured before the first green `main` push (see `RELEASING.md`).
  The publish job uses `concurrency` so overlapping `main` pushes can't race a publish.
  The bundle-size budget stays **confirm-only** at 300 kB.
- The e2e is sensitive to a cold `next start`: the thread refresh after a post briefly
  remounts the reply composer, so the smoke test attaches on the freshly-opened composer
  and avoids back-to-back posts (a 90s per-test budget + one CI retry absorb cold-start
  slowness). No prior ADR is superseded.

---

## ADR-0027 — Route-level `disabled` flag on `createCommentsRoute`

- **Date:** 2026-06-03
- **Status:** accepted

**Context.** A Next.js host often wants the commenting tool live only when its backends
are provisioned (e.g. both `MONGODB_URI` and `BLOB_READ_WRITE_TOKEN`). When a backend is
absent — local dev, preview deploys — the mounted route should answer `404` to every
method and the widget should stay dormant. Hosts expressed this with a ternary that
hand-builds a `{ GET: notFound, POST: notFound, ... }` object.

**Decision.** Add an optional `disabled?: boolean` to `createCommentsRoute`'s parameter
type only — `CreateCommentsServerOptions` (the server core) stays unaware of it. When
truthy, the function returns four handlers that each respond `404 Not Found` and never
calls `createCommentsServer`. The returned `server` is therefore widened to optional
(`server?: CommentsServer`) and is `undefined` on the disabled path. The other config
fields stay required — an "added optional flag", not a discriminated union, chosen for
minimal type machinery. `disabled` gates only the route; hosts gate the widget mount on
the same condition so a dormant API is never paired with a mounted widget.

**Consequences.** Hosts drop the hand-rolled `notFound` boilerplate. Breaking for
`@airnauts/comments-next`: consumers reading `route.server` must now narrow it
(`route.server?.…`). When disabled, no rate limiter is built and the lazy
repository/storage are never touched. Ships as a minor (pre-1.0) BREAKING bump.

---

## ADR-0028 — Explicit `token` for `vercelBlobStorage` (no ambient env read)

- **Date:** 2026-06-03
- **Status:** accepted

**Context.** `vercelBlobStorage`'s `token` was optional; when omitted, `@vercel/blob` read
`BLOB_READ_WRITE_TOKEN` from `process.env` automatically. That ambient read was
inconsistent with the other adapters — `mongoRepository({ uri })` and
`fileSystemStorage({ rootDir, baseUrl })` take their configuration explicitly.

**Decision.** Make `token: string` required on `VercelBlobStorageOptions` and drop the
`= {}` default from both the `VercelBlobStorage` class constructor and the
`vercelBlobStorage` factory. The host passes the env value in explicitly, mirroring
`mongoRepository`. Enforcement is type-level only: like `mongoRepository` (which does not
validate `uri`), no runtime guard is added — a caller defeating the type
(`undefined as string`) would still hit `@vercel/blob`'s env fallback.

**Consequences.** Configuration is uniform and explicit across adapters. Breaking for
`@airnauts/comments-storage-vercel-blob`: `vercelBlobStorage()` / `new VercelBlobStorage()`
with no token no longer typecheck. Ships as a minor (pre-1.0) BREAKING bump.

---

## ADR-0029: Notification seam + Slack notifier

- **Date:** 2026-06-03
- **Status:** accepted

**Context.** Integrators want to be told when reviewers leave comments, starting with
Slack, and more channels (email, …) are expected. We need an extension point that does
not couple the server core to any one provider, and notification delivery must never be
able to fail a comment write.

**Decision.** Add a generic `Notifier` output port to `@airnauts/comments-server`
(alongside `Repository` and `StorageAdapter`), injected via `notifiers?: Notifier[]` on
`createCommentsServer`. The `createThread` and `addComment` use cases build a shared
`NotificationEvent` after a successful write and fan it out through
`dispatchNotifications`, which uses `Promise.allSettled` — a notifier that throws is
logged (by `name`, never its credentials) and swallowed. Dispatch is **awaited** within
the request rather than fire-and-forget, because a detached promise is dropped when a
serverless function freezes after the response. The first concrete is a new publishable
package, `@airnauts/comments-notifier-slack`, which POSTs Block Kit JSON to a Slack
Incoming Webhook with a 3-second `AbortSignal.timeout` so a hung endpoint cannot stall
the write.

**Consequences.** New channels plug in with no core change. The notification round-trip
is added to comment-POST latency (acceptable for v1; a future `waitUntil`-style hook can
move it off the request path without changing the seam). The Slack link is the bare
`pageUrl`: a recipient sees comments only if they already hold the activation key
(localStorage or `?comments-key=…`); embedding the key and a `?comment=<threadId>`
deep-link is a documented follow-up.

---

## ADR-0030 — ThreadListItem carries a rootComment preview

- **Date:** 2026-06-03
- **Status:** accepted

**Context.** The cross-page panel needs to show each thread's initial message inline;
`ThreadListItem` carried only counts/authors, forcing an N+1 of `getThread` per row.

**Decision.** Add an additive, nullable `rootComment { text, createdAt }` to
`ThreadListItem` (not `Thread`), projected by both adapters from `comments[0]` via the
shared `toListItem`; mongo widens the list projection with `$slice: 1`.

**Consequences.** One list request renders previews; empty `text` denotes an
attachment-only root; pre-1.0 `minor` bump across core/adapters/server/next; `Thread`
is unchanged so `getThread`/`createThread` paths are untouched.

## ADR-0031 — Server owns the thread deep-link

**Date:** 2026-06-08. **Status:** accepted.

**Context.** The thread deep-link (`pageUrl?comments-thread=<id>`) is a contract between the
widget (reads the param to focus a thread) and notifiers (write it). The Slack notifier
re-declared its own `DEFAULT_THREAD_PARAM` and `threadParam` option, duplicating the client's
constant with nothing enforcing they match; each new channel would copy it again.

**Decision.** Move `DEFAULT_THREAD_PARAM` and `threadLink()` into `@airnauts/comments-core` as the
single source of truth. `createCommentsServer` gains an optional `threadParam` (default from core),
carried on `Ctx`; `buildNotificationEvent` builds the full link once and adds `threadUrl` to
`NotificationEvent`. Notifiers read `event.threadUrl` and never construct links. The widget and
server defaults both come from the core constant, so the zero-config case agrees automatically.

**Consequences.** Removing `threadParam` from `SlackNotifierOptions` is breaking (pre-1.0 → minor).
`NotificationEvent` carries one more field. A host that renames the param sets it in two places
(widget + server), never per-notifier. Supersedes the per-notifier link handling introduced in
ADR-0029.

## ADR-0032 — Email notifier with a pluggable transport port

**Date:** 2026-06-08. **Status:** accepted.

**Context.** Email is the second notification channel (after Slack, ADR-0029). Unlike a Slack
webhook (one channel baked into the URL), email is per-recipient, and hosts run on different
providers and runtimes (Node servers vs. serverless/edge). A static recipient list was considered
but rejected: the value of email is keeping a thread's participants in the loop as it grows, and a
hand-maintained list neither targets the right people nor scales per thread.

**Decision.** Ship `@airnauts/comments-notifier-email`: `emailNotifier({ transport, from, … })`
implements the `Notifier` port and delegates delivery to an injected `EmailTransport` port. Two
built-in transports as subpath exports — `/smtp` (nodemailer, optional peer dep) and `/resend`
(fetch) — keep the package root dependency-free; any provider can be added by implementing the
port. **Recipients are the thread's participants**: the server derives `event.participants` (the
thread's distinct comment authors, minus the event's own author) in `buildNotificationEvent`, and
the notifier sends to that list (single → `to`; multiple → `bcc` for privacy; empty → no send).
Bodies are HTML + plain-text multipart with HTML-escaped user content, a minimal HTML document
shell, and CR/LF folded out of the subject to block header injection.

**Consequences.** A `thread.created` event has only its author as a participant, so after the
self-exclusion **a brand-new thread emails nobody** — notifications begin once a thread has a
reply. The "alert a fixed team about every new thread" use case is intentionally not served here;
a host wanting that supplies its own `Notifier` (or Slack). Deriving participants is free — the
use-case already loaded the thread. `nodemailer` is CJS/Node-only — the SMTP transport will not run
on edge; Resend will. Under ADR-0029 (dispatch awaited in-request to survive serverless freeze) the
SMTP handshake adds more comment-POST latency than the HTTP channels, so the SMTP transport caps
connection/greeting/socket at a 10 s default. Mention events and host-overridable templates remain
deferred; the ports accommodate them later with no core change.

## ADR-0033 — Restrict `pageUrl` to http(s) schemes

**Date:** 2026-06-09. **Status:** accepted.

**Context.** `pageUrl` was validated with a bare `z.url()`, which accepts any scheme parseable by
`URL` — including `javascript:` and `data:`. The server builds the thread deep-link (`threadUrl`,
ADR-0031) from `pageUrl`, and notifiers render it into an email `href` and Slack markdown. An
active scheme stored as `pageUrl` would therefore flow into a clickable link, and the email's
attribute-escaping prevents markup breakout but not a `javascript:`/`data:` URL itself.

**Decision.** Introduce a shared `HttpUrl = z.url({ protocol: /^https?$/ })` in core and use it for
`pageUrl` on both the `CreateThreadBody` request (the ingestion boundary) and the `Thread` schema.
Non-http(s) schemes are rejected at validation. The schema stays inline (no named component) so the
wire contract still emits a plain URL string.

**Consequences.** Browser hosts are unaffected — `window.location.href` is always http(s). A host
embedding the widget on a non-http(s) origin (e.g. a `file://` page) can no longer create threads;
this is an accepted trade-off for closing the active-scheme vector at the source rather than
per-notifier. Pre-1.0 `minor` bump on core. Attachment URLs are unchanged (server-generated).

## ADR-0034 — Server extension capability model (notifications + thread actions)

**Date:** 2026-06-09. **Status:** accepted.

**Context.** Notifications (Slack/email) were the only server plugin type, accepted via `notifiers?`.
We now need manual, user-triggered integrations (Jira issue creation) that run on command and persist
returned state on the thread. Both are plugins, but they have different lifecycles: notifications
subscribe to events and must be failure-isolated; thread actions run explicit user commands, may fail
visibly, and persist external links.

**Decision.** Introduce a single `extensions` construction option carrying a discriminated union
`ServerExtension = NotificationExtension | ThreadActionExtension`. Extensions are server-side and may
contain functions (`onEvent`, `run`, `visibleWhen`); the client never receives executable extension
code — only typed `ThreadActionDescriptor`s evaluated server-side. Thread read responses embed a
computed, non-persisted `actions` array; threads persist `externalLinks`. A generic
`POST /threads/:id/actions/:actionId` endpoint runs actions. `notifiers?` remains a deprecated alias
that wraps `Notifier[]` into notification extensions.

**Consequences.** One loader/registration path for all server plugins; future integrations (Linear,
GitHub Issues) reuse the thread-action shape with no server change. Notification failures stay
isolated (`Promise.allSettled`); thread-action failures surface to the reviewer because the action
was explicitly requested. `actions` is response-only — it must never be written to storage.
`notifier-slack` / `notifier-email` public factory APIs change (pre-1.0 breaking) to return
notification extensions. Concurrent duplicate creation is not fully prevented in v1 (practical
mitigation only); documented as a known limitation.

---

## ADR-0035: PostgreSQL repository adapter

- **Date:** 2026-06-08
- **Status:** Accepted. Amends ADR-0003 (which scoped v1 to a single MongoDB
  repository concrete and listed "other DBs" as a designed-but-unbuilt seam).

### Context

Adopters who run PostgreSQL rather than MongoDB had no persistence path. The
`Repository` seam and its shared conformance suite (`repositoryContract`) were
built to make a second concrete cheap; the open question was how to add Postgres
without (a) coupling to a specific driver and (b) breaking on serverless hosts,
where raw Postgres connections exhaust unlike the pooled mongo driver.

### Decision

Add `@airnauts/comments-adapter-postgres` as a second `Repository` concrete:

- **Driver-agnostic executor seam.** `createPostgresRepository({ sql })` accepts
  any `{ query(text, params): Promise<{ rows }> }` (pg.Pool, Neon Pool, PGlite),
  mirroring how `createMongoRepository({ db })` takes a connected `Db`. The host
  owns pooling, so the same adapter works on long-lived and serverless hosts. A
  `postgresRepository({ connectionString })` convenience covers the simple case
  via an optional `pg` peer dependency.
- **Hybrid storage.** One `comments_threads` table with scalar columns for the
  filtered/sorted fields plus a `doc jsonb` holding the full wire Thread; a
  `comments_attachments` table alongside. `updated_at` is stored as text (exact
  ISO string) so keyset pagination stays byte-for-byte consistent with the
  cursor; `env` is `NOT NULL DEFAULT ''`.
- **Idempotent `ensureSchema`**, mirroring mongo's `ensureIndexes`.
- **Hermetic tests** via PGlite (in-process WASM Postgres) running the shared
  contract suite; documented to gate SQL correctness, not concurrency (every
  write is single-statement atomic by construction).

### Consequences

- Postgres becomes a drop-in alternative to Mongo behind the unchanged seam.
- The executor seam pushes connection lifecycle to the host — the price of
  serverless portability.
- MySQL and Redis remain unbuilt seams; a shared SQL core is deliberately NOT
  abstracted until a second SQL adapter exists (rule of three).

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

## ADR-0037 — Unify adapter and extension factory names

- **Date:** 2026-06-15
- **Status:** accepted

**Context.** The factory functions a host calls to build repositories, storage
adapters, and server extensions had drifted into two naming styles. Some used a
`create` prefix (`createMongoRepository`, `createPostgresRepository`,
`createCommentsServer`, `createNextHandler`); the storage adapters, the in-memory
repository, and every notification/integration extension used a bare-noun style
(`fileSystemStorage`, `vercelBlobStorage`, `memoryRepository`, `slackNotifications`,
`emailNotifications`, `jiraIssues`). The in-memory adapter was a further outlier —
it exposed a class (`InMemoryRepository`) where the other repository adapters expose
a `create<Provider>Repository` factory.

**Decision.** Adopt one verb per role.

- **Object-building factories** (build one adapter from its config/parts) take the
  `create<Provider><Type>` prefix: `createFileSystemStorage`, `createVercelBlobStorage`,
  and a new `createMemoryRepository`.
- **Server-extension factories** — which return an array spread into `extensions: [...]`
  and are commonly composed together — take a `<provider>Extension` suffix:
  `slackExtension`, `emailExtension`, `jiraExtension`, with matching
  `SlackExtensionOptions` / `EmailExtensionOptions` / `JiraExtensionOptions` types.
- The repository **two-tier split is left intact**: `create<Provider>Repository({ connection })`
  (bring-your-own connection) vs `<provider>Repository({ uri })` (adapter owns and
  memoizes the connection) for mongo/postgres encodes a real distinction, not an
  inconsistency, so those names are unchanged. `InMemoryRepository` (the class) stays
  exported.

**Rejected:** making the identifier *identical* across interchangeable packages
(`createStorage` / `createRepository` everywhere). The canonical integration example
wires more than one backend in a single file (env ternary) and notifiers are spread
together, so identical names would force aliased imports and collisions — optimizing
the rare single-backend case at the expense of the multi-backend pattern the docs teach.

**Consequences.** Breaking for six publishable packages (`storage-fs`,
`storage-vercel-blob`, `adapter-memory`, `notifier-slack`, `notifier-email`,
`integration-jira`); pre-1.0 → `minor`. The old names (`fileSystemStorage`,
`vercelBlobStorage`, `memoryRepository`, `slackNotifications`, `emailNotifications`,
`jiraIssues`, and the `*NotifierOptions` / `JiraIssuesOptions` types) ship as
`@deprecated` aliases for one release to ease migration, then are removed in the
following minor. The mongo/postgres factory names and all `create*` server/Next names
are unchanged. Refines the adapter-construction convention of ADR-0021.

## ADR-0038 — Rebrand `comments` → `airside`

**Date:** 2026-06-16
**Status:** accepted (supersedes the package-naming portion of ADR-0020)

**Context.** The product was published under the generic `comments` brand (`@airnauts/comments-*`, repo `commenting-tool`, `cmnt:` CSS prefix). "comments" is both our brand *and* the domain noun, which muddied identity and SEO and tied us to a generic name. While still pre-1.0 (one production consumer), a clean break is cheap. "Airside" plays on "aside" (a remark to the side) and the aviation term, tying to the Airnauts brand.

**Decision.** Full rebrand of the brand/namespace, keeping the npm scope `@airnauts`:
- Packages `@airnauts/comments-*` → `@airnauts/airside-*`; the three extension packages are recategorized to `@airnauts/airside-extension-{slack,email,jira}`.
- Every brand-carrying token moves: Tailwind prefix `cmnt:` → `air:`, CSS vars `--cmnt-*` → `--air-*`, `data-comments-*` → `data-airside-*`, storage keys `comments:*`/`cmnt:focus` → `airside:*`, query params `comments-key`/`comments-thread` → `airside-*`, header `x-comments-key` → `x-airside-key`, env `COMMENTS_*` → `AIRSIDE_*`, public JS symbols (`comments.init`→`airside.init`, `<CommentsLayer>`→`<AirsideLayer>`, `CommentsHandle`→`AirsideHandle`, `commentsKey`→`airsideKey`, `createComments*Route`→`createAirside*Route`, `CommentsServer`→`AirsideServer`).
- The **domain** is untouched: the `Comment` type/schema, `comments[]` fields, the `comments` Mongo database name, and "Add comment"/"Reply" UI copy stay.
- GitHub repo renamed in place `Airnauts/commenting-tool` → `Airnauts/airside` (auto-redirects).
- The old `@airnauts/comments-*` packages are **deprecated with a pointer** to their airside replacements — no shim, no republish.
- Versioning **continues the line**: the final `comments` release was `0.7.0`; airside debuts at `0.8.0` (one breaking minor under the pre-1.0 policy), same code and maturity.

**Consequences.** Existing embeds lose persisted state on upgrade (identity re-prompt, launcher position reset, one extra activation) — an accepted one-time cost vs. a permanent dual-read shim. Every internal `workspace:^` dep flips in one change, so the Changesets-only publish path is load-bearing (a hand `npm publish` would leak `workspace:^`). The one published consumer (lear-frontend) breaks and needs a cross-repo follow-up (new package names, `airsideKey`, `?airside-key`). ADR-0020's package-naming decision is superseded; its npm-scope and MIT/Changesets decisions stand.

## ADR-0039 — Brand and unify the persistence storage identifiers

**Date:** 2026-06-16
**Status:** accepted (supersedes the table-naming portion of ADR-0035 and the "Mongo database name stays" point of ADR-0038)

**Context.** The Airside rebrand (ADR-0038) initially kept the persistence-layer names as domain. That left two `comments`-branded identifiers in the storage schema, asymmetrically between adapters:
- **Postgres** stored data in tables `comments_threads` / `comments_attachments` (ADR-0035). Postgres tables live in a *shared* schema (default `public`) alongside the consumer's own tables, so a namespacing prefix is needed to avoid collisions.
- **Mongo** used *unprefixed* collections `threads` / `attachments`. Mongo collections live in a *dedicated database* (the db name in `MONGODB_URI`), so the database itself is the namespace and no prefix was used.

The example also pointed `MONGODB_URI` at a database literally named `comments`. The asymmetry (one adapter prefixed, one not) and the lingering `comments` brand were both worth resolving while still pre-1.0.

**Decision.** Brand and **unify** the storage identifiers on the `airside_` prefix across both adapters:
- Postgres tables `comments_threads` / `comments_attachments` → `airside_threads` / `airside_attachments` (and the index `comments_threads_list` → `airside_threads_list`).
- Mongo collections `threads` / `attachments` → `airside_threads` / `airside_attachments`.
- The example Mongo database name `comments` → `airside` (`MONGODB_URI=…/airside`); the host route path `/api/comments` → `/api/airside` (example/doc convention only — the handler routes off the catch-all sub-path, so the prefix is arbitrary).

We unify **"up"** (prefix both) rather than **"down"** (drop the Postgres prefix to bare `threads`): the Postgres prefix is load-bearing in a shared schema, and prefixing Mongo too — though mildly redundant given its dedicated database — yields identical identifiers across adapters and stays safe if a consumer ever points Mongo at a shared database.

**Consequences.** This is a breaking storage-schema change: `ensureSchema` / index creation make fresh `airside_*` tables/collections, so any pre-existing data under the old names is orphaned (a deliberate reset, consistent with ADR-0038's pre-1.0 stance). Safe to take now — the Postgres adapter is new with no production deployments, and the one Mongo consumer (lear-frontend) has not deployed its integration, so no live data is affected. Existing deployments, if any, must rename their tables/collections or re-create them. The `Comment` domain type, `comments[]` data fields, and "Add comment"/"Reply" UI copy remain unchanged — only the physical storage identifiers moved.

## ADR-0040 — Extract the React mount into `@airnauts/airside-integration-react`

- **Date:** 2026-06-16
- **Status:** accepted

**Context.** The host-facing `<AirsideLayer/>` React wrapper shipped as the
`@airnauts/airside-client/react` subpath of the otherwise framework-agnostic widget
engine. On the server side we already separate the framework-agnostic core
(`airside-server`) from its host-framework integration (`airside-integration-next`).
React is to the client what Next is to the server — one host-framework integration over
a framework-agnostic core — but the package boundaries did not express that, and every
non-Next React host still pulled the wrapper from inside `airside-client`.

**Decision.** Promote the wrapper to a dedicated `@airnauts/airside-integration-react`
package (depends on `airside-client`, `react` as a required peer, ships a `'use client'`
banner). Remove the `@airnauts/airside-client/react` subpath outright — a clean break,
no shim (a re-export shim would create a `client/react` → `integration-react` → `client`
package cycle). `airside-integration-next` depends on `integration-react` and re-exports
`AirsideLayer` via a new `./client` subpath, so Next users still get the route handlers
and the mount from one package.

**Consequences.** `airside-client` sheds its `react`/`react-dom` peer deps and becomes a
zero-peer-dep vanilla package (it bundles its own React for the widget UI). Removing a
published subpath is breaking; pre-1.0 that is a minor bump (fixed group → 0.9.0), and
the only external consumer (`lear-frontend`) is under our control. Non-Next React hosts
now depend only on `@airnauts/airside-integration-react`. This refines the widget-delivery
shape recorded in ADR-0002 (the thin `<AirsideLayer/>` wrapper moves out of the client
subpath); ADR-0002 otherwise stands.

## ADR-0041 — Tag each release with a single `vX.Y.Z`, cut in CI on publish

- **Date:** 2026-06-18
- **Status:** accepted

**Context.** Through `0.6.0` the repository carried per-package git tags
(`@airnauts/comments-core@0.6.0`, …), a side effect of running `changeset publish`
locally and pushing its tags. When publishing moved into the CI `publish` job (ADR-0020
machinery), `changeset publish` still creates those tags — but on the ephemeral runner,
which never `git push`es them, so they were silently discarded. Releases `0.7.0` through
`0.9.0` shipped to npm untagged. RELEASING.md had codified this as "No tags required."
Losing tags means no `git`-side record of what commit each published version corresponds
to, and nothing to anchor future release notes or `git describe` against.

**Decision.** Have the `publish` job cut **one annotated `vX.Y.Z` tag per release** and
push it, in a step that runs after `changeset publish` succeeds. The version is read from
`packages/core/package.json`: the 13 packages are a Changesets `fixed` group sharing one
version, so a single repo-level tag names the whole release. We deliberately do **not**
emit Changesets' default per-package `pkg@version` tags — one tag per release, not
thirteen. The step gates on tag existence (`git ls-remote --exit-code --tags`), so it is
idempotent across the every-push-to-`main` cadence of the job and tags each version
exactly once. This requires `contents: write` on the job so the default `GITHUB_TOKEN`
can push the tag. This supersedes the "No tags / No tagging step" stance previously
documented in RELEASING.md.

**Consequences.** Every release from the next version bump onward gets a durable,
pushed `vX.Y.Z` tag pointing at the published commit, restoring the `git`-side release
record (now release-level rather than per-package). The change is release tooling only —
no publishable package behavior changes, so it ships without a changeset. One-time effect:
`0.9.0` is already on npm without a `v0.9.0` tag, so the next push to `main` backfills
`v0.9.0` against the then-current tip. We did not add a GitHub Release step: with the
`fixed` group, any single package's changelog section for a version is incomplete (e.g.
`core`'s `## 0.9.0` is empty because nothing in `core` changed that release), so faithful
release notes would require aggregating across all 13 changelogs — deferred as out of
scope; the tag is the agreed deliverable.

## ADR-0042 — Autonomous issue→PR automation as a local `/loop` skill

- **Date:** 2026-06-18
- **Status:** accepted

**Context.** We want labelled GitHub issues to be picked up and driven to a pull request
with minimal human steering: simple tasks built directly, complex tasks specced for
approval first, every task shipped as a draft PR, auto-reviewed, promoted to ready, and
then the human's PR comments applied automatically — all without the next run redoing
finished work. The substrate options were GitHub Actions (event-driven), a claude.ai cloud
routine (polling), or a local Claude Code session. The official `anthropics/claude-code-action`
covers much of the GitHub-Actions shape, but we chose the **local** path for simplicity:
the user runs `/loop 5m /airside-agent`, re-executing a skill every five minutes in one
session. `/loop` is **serial** (a wakeup fires only when the agent is idle after the
interval), so ticks never overlap and correctness never depends on timing — the five
minutes is a cadence, not a backbone.

**Decision.** Build the orchestrator as the **`airside-agent` skill** (`.claude/skills/`),
which on each tick advances each `agent`-labelled issue by one step and spawns at most one
isolated subagent for heavy work (`.claude/agents/airside-builder` and, in later slices,
reviewer/fixer/spec agents). **State lives in GitHub, reconciled by precedence each tick:**
observable artifacts (issue state, the `agent/issue-<n>` branch, the PR and its draft/merge
state, review-thread resolution) are ground truth; a single JSON **state comment** on the
issue is a hint cache; the `state:*` **labels** are a derived, human-visible mirror, never
authoritative. **PR-last** makes "a PR exists ⇔ the build is complete" a clean binary, so a
tick that dies mid-build is safe to resume. Builder/fixer subagents run with the Agent tool's
`isolation:"worktree"`, which a spike confirmed composes with this repo's `WorktreeCreate`
hook to give a real, locally-built worktree (~1 min setup, no symlink-to-main trap). This
introduces a **per-issue draft-PR → review → ready flow** for agent-handled tasks — a
deliberate, scoped exception to the repo's "commit directly to `main` until beta" rule
(that default still governs human work). Delivery is incremental: **Slice 1** ships the
simple path (issue → draft PR) only; later slices add the reviewer/fixer loop, the complex
spec/approval path, and the post-ready PR-comment fixer.

**Consequences.** The automation needs no CI secrets or GitHub Actions and is driven from a
machine the user already runs; the trade-off is that it only progresses while that `/loop`
session is alive. Idempotency is structural (labels + state comment + artifact precedence),
so re-ticks and mid-op deaths never duplicate work; the user-requested `PROGRESS.md` becomes
a human log on the task branch rather than the lock. Anti-runaway guards are explicit: ≤ 1
subagent spawn per tick, an auto-fix iteration cap (`REVIEW_CAP`, Slice 2) before escalating
to `state:blocked`, and owner-only authorisation for `/approve` and PR-comment actions.
Because the worker agents are substrate-agnostic prompts, migrating later to
`anthropics/claude-code-action` would be a re-wiring of triggers, not a rewrite. This is
tooling under `.claude/`/`docs/`, so it ships without a changeset.

## ADR-0043 — airside-agent Slice 5: CI-green gate before ready; drop PROGRESS.md

- **Date:** 2026-06-18
- **Status:** accepted (refines ADR-0042)

**Context.** Two rough edges surfaced once the `airside-agent` pipeline (ADR-0042) had run
end-to-end. (1) The automated reviewer reads the **PR diff, not CI** — so a reviewer-clean PR
could be promoted draft → ready while its CI was red, presenting a broken PR as "ready for
review." (2) ADR-0042 had the builder write a `PROGRESS.md` branch log as a "human-readable
trail." In practice the durable progress already lives in the GitHub **state comment** + the
`airside-agent-review` notes; `PROGRESS.md` added nothing the issue didn't already show, collided
at the repo root across concurrent agent branches, and the reviewer itself flagged it as noise on
the first real run. Separately, Slice 4 had shipped post-ready PR-comment handling for **inline
review threads only**, leaving top-level PR conversation comments unhandled.

**Decision.** (1) **Gate promotion on CI.** Before `gh pr ready`, read `statusCheckRollup`: any
completed check failing (`FAILURE`/`ERROR`/`CANCELLED`/`TIMED_OUT`/`ACTION_REQUIRED`) → `state:blocked`
+ a note (a human decides; do **not** loop the fixer on CI red); any check still running → wait and
re-check next tick; all passed/skipped/neutral, **or no checks at all** → promote. (2) **Drop
`PROGRESS.md`** — remove it from the builder and the runbook; the state comment + review notes are
the single progress record. This **supersedes the `PROGRESS.md` consequence of ADR-0042**. (3)
**Handle top-level PR comments** in the `in-review` op (alongside inline threads), anchored on the
newest agent-ack comment (the same artifact-anchoring as the approval grammar), since top-level
comments have no resolve primitive. We deliberately **defer** round-robin fairness and a global
`MAX_ACTIVE` ceiling: the `≤1 op/tick` invariant plus the user-started/stopped loop already bound
burn, and no multi-issue contention or unattended run has been observed to justify the machinery
(and a bad `MAX_ACTIVE` would silently strand labelled issues).

**Consequences.** A PR now reaches "ready" only when CI is green (or genuinely absent), so the
ready signal is honest; the cost is that `reviewing` gains a "wait for pending CI" sub-state, so a
tick may pass without promoting. One fewer artifact per branch and no repo-root collisions. The
`in-review` phase is no longer inline-only — every PR comment surface a human uses is covered. The
deferred items remain easy to add later (each is a localized op-selection/skip change) if real need
appears. Tooling-only under `.claude/`/`docs/`, so no changeset.

## ADR-0046 — Client settings persisted through a single read-once store with typed accessors

- **Date:** 2026-06-18
- **Status:** accepted

**Context.** The widget's client-side persistence had grown by accretion: each feature that
needed `localStorage` dropped its own `<domain>/storage.ts` module with a near-identical
`load*`/`save*` pair — `activation/storage.ts` (`airside:key`), `identity/storage.ts`
(`airside:identity`), and `launcher/storage.ts` (`airside:launcher-position`). Every module
re-implemented the same try/catch-guarded `getItem` → `JSON.parse` → validate → default read,
and each consumer read `localStorage` afresh on every mount. Adding the issue #32 "hide all
pins" flag would have meant a fourth copy of that boilerplate. The owner asked (in the #32
spec, approved with "add adr") for a single client settings store the new flag and the existing
sites route through, and for the pattern to be documented.

**Decision.** Introduce one client-internal settings store, `packages/client/src/settings/store.ts`,
as the sole chokepoint for `localStorage`-backed widget settings. It declares a typed schema with
one entry per key — the on-disk key string, a default, and the per-key parse/validate guard lifted
unchanged from the old modules. `initSettings(storage = localStorage)` performs a **single read**
of every key into an in-memory cache (re-runnable); `getSetting(key)` returns the cached value and
lazily hydrates on first access if init has not run (so a directly-mounted `WidgetApp` and SSR-safe
import both work); `setSetting(key, value)` updates the cache and persists with a **try/catch-guarded
write** (a quota/availability error must not crash a toggle or a login — a deliberate hardening over
the old bare `setItem`); `resetSettings()` is a test seam that drops the cache so a freshly-seeded
`localStorage` re-hydrates. The widget calls `initSettings()` once at startup in `init()`. The three
former storage sites now read/write through the store under the **same on-disk keys** with no
behavior change; the domain modules keep only their shared, non-storage exports (the `Identity` type,
the launcher `LauncherPosition`/`LauncherEdge` types, `DEFAULT_LAUNCHER_POSITION`, `clampTop`). The
store is **not** exported from the package index — it adds no public API. `sessionStorage` (the
per-tab focus handoff) is explicitly out of scope: the store is localStorage-only.

**Consequences.** New persisted client settings now cost one schema entry instead of a bespoke
module, and validation/guarding live in one audited place. The load-bearing trade-off is the
**read-once cache**: a consumer that seeds `localStorage` and then reads must do so against a
fresh cache — fine in production (hydrated once per page load) but it means consumer **tests**
that seed-then-act must call `resetSettings()` between cases, or a stale cached value leaks
across them. This is now a standing rule for client tests touching persisted settings. Writes
becoming best-effort means a persistence failure is silently swallowed rather than thrown; the
in-memory value still updates, so the live session is unaffected and only the across-reload
durability is lost in that rare case. The store is the established pattern for future client
settings; adding sessionStorage-backed or host-configurable settings would be a deliberate
extension, not an ad-hoc module.

## ADR-0047 — Colocate each setting's config with its domain module; the store is a generic registry

- **Date:** 2026-06-29
- **Status:** accepted (refines ADR-0046)

**Context.** ADR-0046 introduced the single read-once settings store but kept every key's wiring
(its on-disk key, default, and parse guard) inlined in `settings/store.ts`, while the domain
modules (`identity/storage.ts`, `launcher/storage.ts`) were slimmed to just their shared types.
In review the owner observed that the store already *imports* those domain modules, so splitting a
setting across two files — its type in the domain module, its storage logic in the store — is the
wrong seam: a setting's whole definition should live next to the feature that owns it, and adding a
setting should mean editing one list, not two.

**Decision.** Move each setting's `SettingEntry` config (on-disk key, default, validate guard) into
its own domain module's `storage.ts`: `activation/storage.ts` (`activationKeySetting`, the module
re-created for this), `identity/storage.ts` (`identitySetting`), `launcher/storage.ts`
(`launcherPositionSetting`, whose guard reuses the colocated `clampTop`), and a new
`marker/storage.ts` (`pinsHiddenSetting`). The `SettingEntry<T>` contract type moves to a leaf
`settings/entry.ts` that the domain modules and the store both import (no import cycle).
`settings/store.ts` now only imports those configs into a single `ENTRIES` object and derives
`SettingKey`/`SettingsSchema` from it, so the type registry and the runtime registry are the same
list; `initSettings`/`getSetting`/`setSetting` already drove everything generically over `ENTRIES`
and are unchanged in behaviour. On-disk keys, defaults, and validation are byte-for-byte the same —
this is a relocation, not a behaviour change (the existing store tests pass unmodified).

**Consequences.** Adding a persisted client setting is now a single registration: write its
`SettingEntry` in the owning domain module and add one line to `ENTRIES` — the schema type follows
automatically, with no second per-key edit in the store. Validation/guarding is no longer
centralized in `store.ts` (the one trade-off vs. ADR-0046), but it lives next to the type and
feature it belongs to and is still funnelled through the one store at runtime. The store keeps its
role as the sole `localStorage` chokepoint, the read-once cache, and the best-effort write; only the
*location* of per-key config changes.
