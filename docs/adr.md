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

- **Status:** accepted
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
