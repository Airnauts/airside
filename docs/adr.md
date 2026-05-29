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
- **Status:** accepted

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
