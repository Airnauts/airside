# Implementation Milestones — Embeddable Commenting Tool (v1)

- **Status:** Proposed
- **Date:** 2026-05-27
- **Source of truth:** [`docs/architecture.md`](architecture.md) + ADRs in [`docs/adr.md`](adr.md)

## How to use this document

This is the **roadmap**, not a detailed plan. Each milestone below is sized to be
its own cycle: **brainstorm → spec (`docs/superpowers/specs/`) → plan
(`docs/superpowers/plans/`) → implement**. Do them one at a time; don't expand
the detail here — that belongs in each milestone's own spec.

**Track separation:** every milestone belongs to exactly one track —
`Infra`, `Shared`, `Backend`, `Frontend`, or `Integration`. No milestone mixes
backend and frontend *feature* development. Backend (M3–M4) and Frontend (M5–M8)
can proceed **in parallel** once the foundation (M1–M2a) is done, because they meet
only through the HTTP contract frozen in M2a.

## Dependency graph

```
M1 Monorepo & tooling  (Infra)
        │
M2a Core: domain & HTTP contract  (Shared)   ← freezes the HTTP contract + anchor schema
        ├──────────────────────────────┐
        ▼                               ▼
  BACKEND track                   FRONTEND track
  M3 API core, security,          M5 Widget shell, isolation & identity
     storage                      M2b Core: anchoring scoring policy & fixture corpus  (Shared)
  M4 MongoDB adapter &            M6 Anchoring runtime   (needs M2b + M5)
     Next.js deployment           M7 Commenting UI
                                  M8 Cross-page panel
        └──────────────┬───────────────┘
                       ▼
        M9 Integration host app & docs  (Integration)
                       │
                       ▼
        M10 Verification & dogfooding  (Integration)
```

M2b (the pure scoring policy + jsdom fixture corpus) depends only on M2a's frozen
`signals` shape and gates **M6 alone**, so it sits on the frontend track and need
not block the backend track or M5.

Sizes are rough: **S** ≈ a few days, **M** ≈ ~1 week, **L** ≈ 1½–2 weeks.

---

## M1 — Monorepo & tooling foundation  ·  Infra  ·  S

**Goal.** A buildable, testable, empty-shell monorepo everything else slots into.

**In scope.** pnpm workspaces; TypeScript project refs; tsup (ESM-first) build;
lint/format; test runner(s); CI skeleton (lint · typecheck · test); the package
shells (`core`, `client`, `server`, `adapter-mongo`, `storage-vercel-blob`,
`storage-fs`) with their `package.json` exports/subpaths wired; a widget
bundle-size budget harness (empty target).

**Out of scope.** Any domain logic, any real implementation.

**Depends on.** —

**Exit criteria.** `pnpm i && pnpm build && pnpm test && pnpm lint` green on empty
packages; subpath exports resolve (`@airnauts/comments-client/react`, `@airnauts/comments-server/next`).

**Refs.** Spec §2.

---

## M2a — Core: domain & HTTP contract  ·  Shared  ·  M

**Goal.** The isomorphic foundation both tracks import — freeze the HTTP contract +
anchor schema here so the backend and frontend tracks can then proceed in parallel.

**In scope.** `@airnauts/comments-core`: branded ID types; domain entity **zod schemas**;
the **anchor fingerprint schema + `schemaVersion`** (`selectors`/`signals`/`offset`/
optional `selection`); the **full HTTP contract** as a declarative operation table +
request/response schemas + error model (the boundary both tracks code against —
freeze it here); **OpenAPI generation** (`buildOpenApiDocument()` + static artifact
+ smoke test); **`pageKey` normalization** (pure, isomorphic, overridable). The
zod/OpenAPI toolchain + contract pattern is recorded as **ADR-0012**.

**Out of scope.** The scoring/threshold policy + fixture corpus (M2b); any DOM
access (M6); any DB/HTTP I/O, the adapter interfaces, the cursor codec, request
validation, and serving `/openapi.json` + `/docs` (M3/M4).

**Depends on.** M1.

**Exit criteria.** Schemas + inferred types + branded IDs published from `core`;
`pageKey` normalization tested; anchor schema + `schemaVersion` frozen; all seven
§6 data endpoints present with request **and** response schemas; OpenAPI 3.1 doc
generates from the schemas (smoke test) + static artifact emits; ADR-0012 added.

**Refs.** Design [`specs/2026-05-27-m2a-core-contract-design.md`](../superpowers/specs/2026-05-27-m2a-core-contract-design.md);
Spec §5–§7; ADR-0004, ADR-0007, ADR-0008, ADR-0009.

---

## M2b — Core: anchoring scoring policy & fixture corpus  ·  Shared  ·  M

**Goal.** Nail and regression-guard the riskiest pure logic — fingerprint scoring —
against a calibrated corpus, before the M6 runtime consumes it.

**In scope.** `@airnauts/comments-core` (over the M2a-frozen `signals` shape): the **pure
scoring weights + threshold policy** (`score()`/`decide()`, accept/margin); the
**DOM→`signals` extraction** (exact shape decided in M2b's own brainstorm — the
goal is that M2a's jsdom fixtures and M6's real DOM exercise identical code); the
**anchoring fixture-corpus harness** (original-DOM → mutated-DOM pairs in jsdom) to
calibrate and lock scoring behavior.

**Out of scope.** Any DOM positioning/overlay or live re-match runtime (M6); any
DB/HTTP I/O (M3).

**Depends on.** M2a (the frozen anchor `signals` shape).

**Exit criteria.** Scoring policy passes the fixture corpus across all mutation
classes (wrapper/reorder/rename/text/attr/remove/duplicate) with documented default
thresholds; the extraction + scoring functions are pure and headless-testable.

**Refs.** Spec §7, §9; ADR-0004, ADR-0008.

---

## M3 — Backend: API core, security & storage  ·  Backend  ·  M

**Goal.** A working HTTP API for the whole contract, persistence-agnostic.

**In scope.** `@airnauts/comments-server` Web-standard `Request → Response` core; router;
**security** (capability-key header check · origin allowlist · CORS); zod
validation; all **use cases** (create thread, list by pageKey / all-pages, get,
reply, resolve/reopen, report-orphan/refresh-anchor, upload); `StorageAdapter`
with **Vercel Blob + filesystem** concretes; an **in-memory repository** for tests
plus the **shared adapter contract suite**; rate limiting; typed error shapes.

**Out of scope.** MongoDB, Next.js glue, OpenAPI serving (M4). Frontend.

**Depends on.** M2a (contract).

**Exit criteria.** Every endpoint works against the in-memory repo; contract tests
pass against zod schemas; security tests (bad key 401, bad origin 403) pass;
storage adapters pass their contract suite.

**Refs.** Spec §4, §6, §8; ADR-0001, ADR-0003.

---

## M4 — Backend: MongoDB adapter & Next.js deployment  ·  Backend  ·  M

**Goal.** Production persistence on the v1 target stack, deployable on Vercel.

**In scope.** `@airnauts/comments-adapter-mongo` (MongoDB repository **passing the M3
contract suite**); indexes from the spec; `@airnauts/comments-server/next` App Router glue
(`createNextHandler`); **static OpenAPI artifact** (runtime `/openapi.json` + Scalar `/docs` deferred — ADR-0015);
integration tests on `mongodb-memory-server`; a deploy recipe for **Vercel +
MongoDB Atlas + Vercel Blob**.

**Out of scope.** Frontend. Other DB/framework adapters (post-v1 seams).

**Depends on.** M3.

**Exit criteria.** Mongo adapter green on the contract suite + integration tests;
one-line Next.js mount documented; the build emits the static `core/dist/openapi.json`; a sample mount
deploys to Vercel against Atlas and round-trips a thread.

**Refs.** Spec §2, §4, §5; ADR-0003, ADR-0007.

---

## M5 — Frontend: widget shell, isolation & identity  ·  Frontend  ·  M

**Goal.** The widget mounts on any page, stays isolated, gates on the key, knows who
you are, and can talk to the backend — before any anchoring.

**In scope.** `comments.init({ key, endpoint, pageKey?, features? })`; **light-DOM
mount** (single host, `all: revert`, Tailwind no-preflight, scoped prefix, portal
container); **shadcn/Radix** setup inside the widget; React **error boundary**;
**activation gate** (valid key in URL); **self-asserted email identity** modal +
`localStorage`; the **API client** (key header, optimistic + rollback); the thin
**`<CommentsLayer/>`** wrapper. A placeholder fixed-position marker proves the
backend round-trip end to end.

**Out of scope.** Real anchoring (M6); thread/composer/panel UI (M7–M8).

**Depends on.** M2a (contract/types); a running backend (M3/M4) or its in-memory
dev server.

**Exit criteria.** Widget mounts only with a valid key; host styles don't bleed in/
out; email captured + remembered; a hard-coded marker can create + read a thread
against the live API.

**Refs.** Design [`specs/2026-05-29-m5-widget-shell-design.md`](../superpowers/specs/2026-05-29-m5-widget-shell-design.md);
Spec §3, §8; ADR-0002, ADR-0005, ADR-0006, ADR-0014.

---

## M6 — Frontend: anchoring runtime  ·  Frontend  ·  L

**Goal.** The defining engine: place an anchor, reload, re-find it — or orphan it.

**In scope.** **Capture** (build dual selectors + signals + offset from real nodes;
text-selection range + quote/prefix/suffix); **re-match** (fast path + scored
search using the M2b policy); **positioning engine** (overlay layer, pin coords,
`ResizeObserver`/scroll/resize/throttled `MutationObserver`, SPA route detection);
**orphan + `selectionLost`** handling; **self-heal** via `PATCH …/anchor`.

**Out of scope.** Thread/composer visual UI (M7) — this milestone renders only the
positioned pin dot + highlight rect needed to prove anchoring.

**Depends on.** M2b (scoring policy), M5 (shell + API client).

**Exit criteria.** Place element pin + text selection → reload → both re-anchor;
mutate the DOM (reorder/rename/wrap) → re-anchors per the fixture-corpus
expectations; unfindable element → orphaned; lost quote → pin retained,
`selectionLost`; pins track scroll/resize/route changes.

**Refs.** Spec §7; ADR-0004, ADR-0008, ADR-0009.

---

## M7 — Frontend: commenting UI  ·  Frontend  ·  L

**Goal.** The full on-page commenting interaction on an anchored pin.

**In scope.** Comment cursor/toolbar (place mode); the **pin component** (marker +
avatar + unresolved count); **thread popover**; **plain-text composer**; **replies**;
**resolve/reopen** with the "show resolved" toggle; **screenshot upload** UI (file
upload → `/uploads` → attach); **text-highlight rendering** for selection anchors;
loading/error/empty states; accessibility pass.

**Out of scope.** Cross-page panel (M8). Markdown/mentions/emoji/capture (post-v1).

**Depends on.** M6 (anchored pins to attach UI to), M4 (uploads endpoint).

**Exit criteria.** Full single-page loop: place → comment → reply → attach image →
resolve → reopen, all persisted; resolved threads hidden by default, shown via
toggle; highlights render for text anchors.

**Refs.** Spec §3, §6; PRD §6.1, §6.3–§6.5; ADR-0005.

---

## M8 — Frontend: cross-page comments panel  ·  Frontend  ·  M

**Goal.** The sole discovery surface (no notifications in v1) — make "what's here
and what changed?" answerable at a glance.

**In scope.** Panel listing threads **across all pages** (page URL, status,
unresolved count); ordering by **most-recently-updated**; **filter by open/
resolved**; **click → navigate to the page and focus the pin**; **orphaned / needs-
review** surfacing.

**Out of scope.** Notifications, inbox, search (post-v1).

**Depends on.** M7 (thread UI to focus), M3 (all-pages list endpoint).

**Exit criteria.** Panel shows threads across pages ordered by activity; filters
work; selecting a thread navigates + focuses its pin; orphaned threads are listed
distinctly.

**Refs.** Design [`specs/2026-06-01-m8-cross-page-panel-design.md`](../superpowers/specs/2026-06-01-m8-cross-page-panel-design.md);
Plan [`plans/2026-06-01-m8-cross-page-panel.md`](../superpowers/plans/2026-06-01-m8-cross-page-panel.md);
Spec §6; PRD §6.6.

---

## M9 — Integration host app & setup docs  ·  Integration  ·  S–M

**Goal.** Prove the published packages integrate on a real Next.js App Router app
through their public seams, and document "integrate in minutes." Manual/visual
proof; automated e2e + dogfood deploy move to M10.

**In scope.** A sample **Next.js host app in `examples/nextjs-host`** (kept alongside
the Vite `playground`): `<CommentsLayer/>` mounted in the layout; a
`createNextHandler` catch-all API route; **env-switched persistence** (`MONGODB_URI`
→ Mongo, else in-memory) and storage (`BLOB_READ_WRITE_TOKEN` → Vercel Blob, else
local `public/uploads/`); three content routes exercising element pins, text
selection, and the cross-page panel. An **integration quickstart** (`docs/integration.md`)
with the host app as its worked example. A **manual smoke checklist** in the example
README. Two small package fixes surfaced by the same-origin mount: the origin policy
(ADR-0017) and typing `createNextHandler`'s `params` for Next 15.

**Out of scope.** Playwright e2e, e2e-in-CI, live deployment, real-project adoption
(all **M10**). No new features, schemas, or endpoints.

**Depends on.** M4 (`@airnauts/comments-server/next`, `adapter-mongo`, `storage-*`) **and**
M8 (frontend complete).

**Exit criteria.** `examples/nextjs-host` builds and runs; opening a page with the
key activates the widget and round-trips a thread; the manual smoke checklist passes
(place → comment → reply → attach → resolve, reload re-anchors, panel navigates
cross-page); repo CI stays green; `docs/integration.md` published.

**Refs.** Design [`specs/2026-06-01-m9-integration-host-app-design.md`](../superpowers/specs/2026-06-01-m9-integration-host-app-design.md);
Plan [`plans/2026-06-01-m9-integration-host-app.md`](../superpowers/plans/2026-06-01-m9-integration-host-app.md);
Spec §9; PRD §7.

---

## M10 — Verification & dogfooding  ·  Integration  ·  M

**Goal.** Automate the integration proof and meet the PRD's acceptance bar in
production.

**In scope.** **Playwright e2e** of the full loop including **reload + DOM-mutation →
re-anchor/orphan**, text selection, and panel navigation (driving
`examples/nextjs-host`); **e2e wired into CI** (headless); **tighten/confirm the
bundle-size budget**; a **Vercel + Atlas + Blob** dogfood deployment; integration
into at least one real project in place of Vercel Comments.

**Out of scope.** New features.

**Depends on.** M9.

**Exit criteria (PRD §7).** Time-to-integrate measured in minutes; comments reliably
re-anchor across repeated redeploys (e2e + the dogfood project); our team adopts it
on at least one real project in place of Vercel Comments.

**Refs.** Spec §9; PRD §7.

---

## Suggested sequence

1. **M1 → M2a** (foundation, sequential — M2a freezes the contract).
2. Then **Backend track (M3 → M4)** and **Frontend track (M5 → M6 → M7 → M8)** in
   parallel. Frontend can develop against M3's in-memory dev server before M4 lands.
3. **M2b** (scoring policy + corpus) is pure and gates **M6 only** — slot it on the
   frontend track any time after M2a and before M6 (e.g. alongside M5).
4. **M9** once both tracks complete, then **M10** (e2e + dogfood deployment).

If you'd rather get a thin end-to-end slice earliest, an alternative is to pull a
minimal vertical (M3 in-memory + M5 + a stripped M6 element-pin loop) forward —
but that deliberately interleaves the tracks, which this split avoids by design.
