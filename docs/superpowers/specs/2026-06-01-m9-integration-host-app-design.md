# M9 — Integration host app & setup docs — design

- **Status:** Approved
- **Date:** 2026-06-01
- **Track:** Integration · Size: S–M
- **Source of truth:** [`docs/architecture.md`](../../architecture.md) §9 · [`docs/prd.md`](../../prd.md) §7
- **Depends on:** M4 (`@comments/server/next` `createNextHandler`, `@comments/adapter-mongo`, `@comments/storage-*`), M8 (frontend complete: anchoring + commenting UI + cross-page panel)

## Goal

Prove the **published packages integrate on a real Next.js App Router app** through
their public seams — `@comments/client/react`'s `<CommentsLayer/>` on the page and
`@comments/server/next`'s `createNextHandler` mounted as an API route — and ship a
short "integrate in minutes" quickstart that uses that app as its worked example.

This is the **slimmed M9**. The original M9 bundled five deliverables; this cycle
delivers two (the host app + the docs). Automated Playwright e2e, e2e-in-CI, the
live Vercel + Atlas + Blob dogfood deployment, and real-project adoption are split
out into a **new M10** (see §5). Verification here is **manual/visual**, captured as
a smoke checklist — the same role `examples/playground` played for M5, now on the
production framework and against the whole stack.

## What is reused, not rebuilt

Nothing new is built in the packages. M9 is pure integration wiring of seams that
already exist and are tested:

- **`@comments/server` `createCommentsServer({ secretKey, projectId, allowedOrigins,
  repository, storage, rateLimit })`** — the Web-standard `Request → Response` core.
- **`@comments/server/next` `createNextHandler(server)`** — returns
  `{ GET, POST, PATCH, OPTIONS }` for an App Router catch-all
  (`app/api/comments/[...path]/route.ts`); strips the mount prefix so the core stays
  mount-unaware. Already covered by `next.test.ts`.
- **`@comments/server` `InMemoryRepository`** + **`@comments/adapter-mongo`
  `createMongoRepository`** — both pass the M3 contract suite.
- **`@comments/storage-fs`** + **`@comments/storage-vercel-blob`** — the
  `StorageAdapter` concretes for the screenshot-upload path.
- **`@comments/client/react` `<CommentsLayer commentsKey endpoint … />`** — calls
  `comments.init()` in an effect, tears down on unmount; the key-in-URL **activation
  gate** lives inside `init()` (M5), so the layer can be mounted unconditionally and
  stays inert until `?comments-key=…` is present.

The host app imports these as `workspace:*` packages exactly as a real integrator
would import the published versions — the example **is** the integration test.

## §1 The host app — `examples/nextjs-host`

A small, self-contained **Next.js App Router** app added **alongside** the kept
`examples/playground` (the Vite playground stays as the minimal no-framework smoke
harness; this is the framework-grade one). It serves double duty: the integration
demo and the doc's copy-pasteable worked example.

**Client seam.** `<CommentsLayer commentsKey={key} endpoint="/api/comments" />`
mounted once in the root layout (`app/layout.tsx`), inside a tiny client component
that reads the `comments-key` URL param. Inert until the page is opened with
`?comments-key=dev-key`; light-DOM isolation (built in M5) keeps host styles from
bleeding in or out.

**Server seam.** `app/api/comments/[...path]/route.ts`:

```ts
export const { GET, POST, PATCH, OPTIONS } = createNextHandler(server)
```

where `server` is built **once** in a shared module (`lib/comments-server.ts`) from
`createCommentsServer(...)`.

**Env-switched persistence (decided).** The shared server module selects concretes
from the environment, so the same example runs zero-config locally *and*
demonstrates the production path:

- **Repository:** `process.env.MONGODB_URI` present → `createMongoRepository(...)`;
  else `new InMemoryRepository()` (ephemeral; resets on restart — acceptable for a
  demo).
- **Storage:** `process.env.BLOB_READ_WRITE_TOKEN` present → Vercel Blob; else
  `storage-fs` writing into a **gitignored** `public/uploads/` dir, so the M7
  screenshot-upload UI renders a working image URL locally (Next serves `public/`).
- **Config:** a fixed `secretKey: 'dev-key'`, `projectId: 'nextjs-host'`,
  `allowedOrigins` covering `localhost`; `rateLimit: false` for the demo.

**Content.** Three routes of varied, realistic DOM so every anchoring + discovery
path has something real to exercise:

- a **landing** page (hero, headings, paragraphs, an image) — element pins;
- an **article** page (long prose, lists, nested headings) — text-selection anchors
  + quote/prefix/suffix re-match;
- a **pricing** page (a table / card grid) — structural DOM that's easy to reorder
  or rename by hand to demonstrate re-anchor vs. orphan.

Three distinct routes make the **cross-page panel** (M8) meaningful: threads land on
different pages and the panel's navigate-and-focus flow has somewhere to go.

The app is `private: true`, `@comments/nextjs-host`, excluded from the bundle-size
budget (it is a host, not a shipped artifact).

## §2 Integration docs — `docs/integration.md`

A quickstart, not a manual — "minutes, not pages." Structure:

1. **Install** — the two packages an integrator actually adds.
2. **Add the API route** — the `createNextHandler` snippet + the `createCommentsServer`
   config, lifted verbatim from `examples/nextjs-host`.
3. **Mount the widget** — the `<CommentsLayer/>` snippet in the layout.
4. **Activate** — open any page with `?comments-key=…`; what the gate does.
5. **Go to production** — the env-var swap to MongoDB + Vercel Blob (the same
   env-switch the example already implements), plus the origin-allowlist note.

Each snippet links to its real counterpart in the example. The example's own
`README.md` covers **running it locally** (the commands + the manual smoke
checklist in §4); `docs/integration.md` is the consumer-facing "how do I add this to
*my* app" doc. Cross-link both, and link `docs/integration.md` from the top-level
`README`/architecture §9 so it's discoverable.

## §3 Milestone bookkeeping — `docs/milestones.md`

- **Rewrite the M9 entry** to this slimmed scope (host app + docs; manual
  verification; depends on M4 + M8).
- **Add M10 — Verification & dogfooding · Integration · M** capturing everything
  deferred (see §5).
- **Update the dependency graph**: the bottom of the graph becomes `M9 → M10`
  (M9 still depends on M4 **and** M8; M10 depends on M9).
- **Update "Suggested sequence"** step 4 to `M9 then M10`.

## §4 Verification (manual — no e2e this cycle)

A smoke checklist in `examples/nextjs-host/README.md`, run against `pnpm dev`:

1. Open a page **without** the key → page untouched, widget inert.
2. Open with `?comments-key=dev-key` → comment affordance appears; first action
   prompts for email (remembered after).
3. **Element pin:** place a pin → reload → it re-anchors to the same element.
4. **Text selection:** select prose → comment → reload → the highlight + pin persist.
5. **Re-anchor under mutation:** hand-edit the page source (reorder / rename / wrap a
   node) → reload → the pin re-anchors per scoring, or moves to **needs-review /
   orphaned** when unfindable.
6. **Upload:** attach a screenshot to a comment → it renders (served from
   `public/uploads/` locally).
7. **Cross-page panel:** create threads on all three routes → open the panel → see
   them ordered by recent activity across pages → click one → it **navigates to that
   page and focuses the pin**; orphans show in the needs-review section.

Repo CI is unchanged and stays green: `lint · typecheck · build · test · size ·
check:exports`. The example is excluded from `size`. No e2e job is added in M9.

## §5 The new M10 (deferred work — specced in its own cycle)

For visibility; M10 gets its own brainstorm → spec → plan:

- **Playwright e2e** of the full loop, **including reload + DOM-mutation →
  re-anchor/orphan**, text selection, and panel navigation — driving
  `examples/nextjs-host`.
- **e2e wired into CI** (headless), and **tighten/confirm the bundle-size budget**.
- **Live Vercel + Atlas + Blob dogfood deployment** (needs cloud credentials + an
  org decision).
- **Real-project adoption** — our team uses it on at least one real project in place
  of Vercel Comments (PRD §7 acceptance bar; operational, not code).

## Non-goals

- No new features, schemas, endpoints, or package code — the M2a contract stays
  frozen and the packages are imported, not modified.
- No automated e2e, no CI e2e job, no live deployment (all M10).
- No new ADR: M9 introduces no hard-to-reverse decision. The env-switch is ordinary
  example wiring, and "split deferred work into M10" is a roadmap edit, not an
  architecture decision.

## Risks & mitigations

- **Next 14 vs 15 `params` shape.** `createNextHandler` already handles `params` as
  Promise-or-plain; pin the example to a single Next version (latest 15) and note
  it. Low risk — covered by `next.test.ts`.
- **Ephemeral in-memory data confuses a first-run demo.** README states data resets
  on restart and points at the `MONGODB_URI` switch for persistence.
- **`public/uploads/` accidentally committed.** Add it to `.gitignore` with a
  `.gitkeep`-free empty-dir note; storage writes there only in fs mode.
- **Scope creep back toward full M9.** The §5 split is explicit; anything e2e/deploy
  is out of bounds this cycle by definition.
