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
can proceed **in parallel** once the foundation (M1–M2) is done, because they meet
only through the HTTP contract frozen in M2.

## Dependency graph

```
M1 Monorepo & tooling  (Infra)
        │
M2 Core: domain, contracts & anchoring policy  (Shared)   ← freezes the HTTP contract + anchor schema
        ├──────────────────────────────┐
        ▼                               ▼
  BACKEND track                   FRONTEND track
  M3 API core, security,          M5 Widget shell, isolation & identity
     storage                      M6 Anchoring runtime
  M4 MongoDB adapter &            M7 Commenting UI
     Next.js deployment           M8 Cross-page panel
        └──────────────┬───────────────┘
                       ▼
        M9 Integration, E2E & dogfooding  (Integration)
```

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
packages; subpath exports resolve (`@comments/client/react`, `@comments/server/next`).

**Refs.** Spec §2.

---

## M2 — Core: domain, contracts & anchoring policy  ·  Shared  ·  L

**Goal.** The isomorphic foundation both tracks import — and the place the riskiest
pure logic (fingerprint scoring) is nailed and regression-guarded first.

**In scope.** `@comments/core`: domain types; **zod schemas + the full HTTP
contract** (the boundary both tracks code against — freeze it here); the **anchor
fingerprint schema + `schemaVersion`**; the **pure scoring + threshold policy**
(weights, accept/margin) and **`pageKey` normalization**; the
**anchoring fixture-corpus harness** (original-DOM → mutated-DOM pairs in jsdom)
to calibrate and lock scoring behavior.

**Out of scope.** Any DOM access (that's M6); any DB/HTTP I/O (that's M3).

**Depends on.** M1.

**Exit criteria.** Contract + schemas published from `core`; scoring policy passes
the fixture corpus across all mutation classes (wrapper/reorder/rename/text/attr/
remove/duplicate) with documented default thresholds; OpenAPI can be generated
from the schemas (smoke test).

**Refs.** Spec §5–§7; ADR-0004, ADR-0007, ADR-0008.

---

## M3 — Backend: API core, security & storage  ·  Backend  ·  M

**Goal.** A working HTTP API for the whole contract, persistence-agnostic.

**In scope.** `@comments/server` Web-standard `Request → Response` core; router;
**security** (capability-key header check · origin allowlist · CORS); zod
validation; all **use cases** (create thread, list by pageKey / all-pages, get,
reply, resolve/reopen, report-orphan/refresh-anchor, upload); `StorageAdapter`
with **Vercel Blob + filesystem** concretes; an **in-memory repository** for tests
plus the **shared adapter contract suite**; rate limiting; typed error shapes.

**Out of scope.** MongoDB, Next.js glue, OpenAPI serving (M4). Frontend.

**Depends on.** M2 (contract).

**Exit criteria.** Every endpoint works against the in-memory repo; contract tests
pass against zod schemas; security tests (bad key 401, bad origin 403) pass;
storage adapters pass their contract suite.

**Refs.** Spec §4, §6, §8; ADR-0001, ADR-0003.

---

## M4 — Backend: MongoDB adapter & Next.js deployment  ·  Backend  ·  M

**Goal.** Production persistence on the v1 target stack, deployable on Vercel.

**In scope.** `@comments/adapter-mongo` (MongoDB repository **passing the M3
contract suite**); indexes from the spec; `@comments/server/next` App Router glue
(`createNextHandler`); **OpenAPI generation + Scalar docs** + static artifact;
integration tests on `mongodb-memory-server`; a deploy recipe for **Vercel +
MongoDB Atlas + Vercel Blob**.

**Out of scope.** Frontend. Other DB/framework adapters (post-v1 seams).

**Depends on.** M3.

**Exit criteria.** Mongo adapter green on the contract suite + integration tests;
one-line Next.js mount documented; `/openapi.json` + `/docs` serve; a sample mount
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

**Depends on.** M2 (contract/types); a running backend (M3/M4) or its in-memory
dev server.

**Exit criteria.** Widget mounts only with a valid key; host styles don't bleed in/
out; email captured + remembered; a hard-coded marker can create + read a thread
against the live API.

**Refs.** Spec §3, §8; ADR-0002, ADR-0005, ADR-0006.

---

## M6 — Frontend: anchoring runtime  ·  Frontend  ·  L

**Goal.** The defining engine: place an anchor, reload, re-find it — or orphan it.

**In scope.** **Capture** (build dual selectors + signals + offset from real nodes;
text-selection range + quote/prefix/suffix); **re-match** (fast path + scored
search using the M2 policy); **positioning engine** (overlay layer, pin coords,
`ResizeObserver`/scroll/resize/throttled `MutationObserver`, SPA route detection);
**orphan + `selectionLost`** handling; **self-heal** via `PATCH …/anchor`.

**Out of scope.** Thread/composer visual UI (M7) — this milestone renders only the
positioned pin dot + highlight rect needed to prove anchoring.

**Depends on.** M2 (scoring policy), M5 (shell + API client).

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

**Refs.** Spec §6; PRD §6.6.

---

## M9 — Integration, E2E & dogfooding  ·  Integration  ·  M

**Goal.** Prove the whole thing works together and meet the PRD's acceptance bar.

**In scope.** A sample **Next.js host app in `examples/`**; **Playwright e2e** of
the full loop including **reload + DOM mutation → re-anchor/orphan**, text
selection, and panel navigation; **bundle-size budget** enforced in CI; a
**Vercel + Atlas + Blob** dogfood deployment; integration/setup docs ("integrate
in minutes").

**Out of scope.** New features.

**Depends on.** M4 (backend) **and** M8 (frontend complete).

**Exit criteria (PRD §7).** Time-to-integrate measured in minutes; comments
reliably re-anchor across repeated redeploys (e2e + the dogfood project);
our team adopts it on at least one real project in place of Vercel Comments.

**Refs.** Spec §9; PRD §7.

---

## Suggested sequence

1. **M1 → M2** (foundation, sequential — M2 freezes the contract).
2. Then **Backend track (M3 → M4)** and **Frontend track (M5 → M6 → M7 → M8)** in
   parallel. Frontend can develop against M3's in-memory dev server before M4 lands.
3. **M9** once both tracks complete.

If you'd rather get a thin end-to-end slice earliest, an alternative is to pull a
minimal vertical (M3 in-memory + M5 + a stripped M6 element-pin loop) forward —
but that deliberately interleaves the tracks, which this split avoids by design.
