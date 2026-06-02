# M10 — Verification, bundle confirm & release CI — design

- **Status:** Approved
- **Date:** 2026-06-02
- **Track:** Integration · Size: M
- **Source of truth:** [`docs/architecture.md`](../../architecture.md) §9 · [`docs/prd.md`](../../prd.md) §7
- **Depends on:** M9 (`examples/nextjs-host` + `docs/integration.md`, merged to `main`)

## Goal

Automate the integration proof that M9 left as a **manual smoke checklist**, and ship
the **release path** that takes the already-prepared `@airnauts/comments-*` packages
(at `0.1.0`, Changesets configured, never published) out to npm.

Concretely, M10 delivers a **Playwright e2e** suite that drives `examples/nextjs-host`
through the full v1 loop — including the riskiest behavior, **re-anchoring across
reload and DOM mutation** — wires it into CI headless, **confirms** the bundle-size
budget, and adds a **tag-triggered publish workflow** with a documented release
runbook.

## Scope revision from the roadmap

The roadmap's M10 ([`milestones.md`](../../milestones.md) §M10) bundled four things:
automated e2e, e2e-in-CI, bundle budget, **and** a live Vercel + Atlas + Blob dogfood
deployment plus **real-project adoption** in place of Vercel Comments.

This cycle delivers the **automated-verification half plus a CI publish path** (the
self-contained, in-repo work with no external-infra dependency), and **adds one
thing the roadmap did not call out: a release workflow** so the prepared packages can
actually ship.

The **dogfood deployment** (Vercel + Atlas + Blob) and **real-project adoption** —
which depend on provisioned external accounts and an organizational decision, and are
not spec-able as in-repo work — **split out to a new M11**. PRD §7's "adopts it for at
least one real project" acceptance bar is met in **M11**, not here. This is the same
slim-this-cycle, defer-the-ops-tail move M9 made when it split e2e/deploy out into
M10.

## What is reused, not rebuilt

M10 adds **tests, two CI workflows' worth of config, and one small test-support
surface** in the host app. No package-code features, schemas, or endpoints. The
verification exercises seams that already exist and are tested at the unit/contract
level:

- **`examples/nextjs-host`** (M9) — the App Router host app: `<CommentsLayer/>` in the
  layout, a `createNextHandler` catch-all route, **env-switched persistence**
  (`MONGODB_URI` → Mongo, else in-memory) and storage (`BLOB_READ_WRITE_TOKEN` →
  Vercel Blob, else local `public/uploads/`), and three content routes
  (landing / article / pricing) exercising element pins, text selection, and the
  cross-page panel.
- **The M2b jsdom fixture corpus** — already proves scoring across all mutation
  classes headlessly. M10's browser mutation e2e is the *full-stack* complement, not
  a replacement: it proves capture → real reload → re-match/orphan end to end in a
  real engine, for a representative subset of mutation classes.
- **Changesets** — `.changeset/config.json` (public access, `main` base, examples +
  test-support ignored), the pending `initial-release.md` changeset, and the root
  `release` script (`pnpm build && changeset publish`). M10 wires these into CI; it
  does not reconfigure them.
- **The bundle-size harness** — `packages/client` `size-limit` entry
  (`@airnauts/comments-client` esm/brotli ≤ **300 kB**) and the root `pnpm size`,
  already a CI step.

## ⚠️ Open dependency — repositories/storages refactor in flight

The author is **refactoring the repository and storage layer** and will **push that to
`main` before the implementation plan is written**. M10's e2e depends on the host
app's **env-switched fallback behavior** (no `MONGODB_URI` → in-memory repo; no blob
token → local `public/uploads/`), which that refactor touches.

The **design** is robust to the refactor because it depends on the *observable
behavior* (hermetic in-memory + local-uploads fallback), not the internal structure.
But the **plan must be written against the pushed code** — so the brainstorm →
**spec** step completes now, and the **writing-plans** step is held until the refactor
lands on `main`. (See "Sequencing" below.)

## Components

### §1 — Playwright e2e suite

A Playwright project that boots `examples/nextjs-host` and drives the full loop in
**Chromium only** (fastest, lowest-flake, dominant review-tool target; cross-browser
deferred).

**Persistence in CI: hermetic in-memory + local uploads.** The suite runs the host
app with **no `MONGODB_URI` and no `BLOB_READ_WRITE_TOKEN`**, so it falls back to the
in-memory repository and `public/uploads/`. No service containers, no secrets. This is
sufficient because re-anchoring is a **client-side** behavior proven across a page
*reload* while the server process stays up — state survives the reload — and the
persistence adapters are already green on the M3 contract suite + M4 integration
tests. Re-testing Mongo here would re-cover known-good ground.

**Server boot.** Playwright `webServer` runs a **production build + `next start`**
(representative of a real deploy; the host app's turbo build is already cached), with
the activation key supplied so the widget activates. Dev-server boot is an acceptable
fallback if `next start` proves flaky under CI.

**Test cases** (each maps to an exit criterion M10 inherits from M5–M8):

| Test | Asserts | Inherited from |
| --- | --- | --- |
| Activation + identity | Page with key activates the widget; email modal captures + remembers identity | M5 |
| Single-page loop | Place element pin → comment → reply → **attach image** → resolve → reopen, all persisted; reload → still anchored | M7 |
| Text selection | Select text → comment → reload → **highlight re-renders** | M6/M7 |
| DOM-mutation re-anchor/orphan | Capture on default page → reload a **variant** → reorder/rename/wrap **re-anchor**; remove **orphans** | M6 |
| Cross-page panel | Thread on page A → navigate via panel → **focuses the pin** on A; orphaned thread **listed distinctly** | M8 |

**Location & tooling.** A dedicated e2e package/dir (e.g. `e2e/` or
`examples/nextjs-host/e2e/`, decided in the plan against the refactored layout),
Playwright config with the `chromium` project and the `webServer` block. Selectors
prefer the widget's stable scoped-prefix classes / roles over brittle DOM paths.

### §2 — Switchable page variants in the host app

The mutation e2e needs the page to render **differently on the second load** than when
the anchor was captured. A minimal **server-rendered variant mechanism** on **one
content route (the article page)** does this:

- `?variant=reordered` — sibling elements reordered around the target.
- `?variant=renamed` — target's tag and/or attributes changed.
- `?variant=wrapped` — target wrapped in an extra container.
- `?variant=removed` — target removed (drives the **orphan** assertion).

Default (no `variant`) renders the unmutated page used for capture. This is a small,
clearly-labeled **test-support surface** in the example app — not a product feature,
not shipped in any package. Kept minimal: one route, server components, no client JS.

### §3 — CI integration

Extend the existing pipeline so the e2e runs **headless on PR + push to `main`**:

- An **e2e job** (in `ci.yml` or a sibling workflow): `pnpm install --frozen-lockfile`
  → `pnpm exec playwright install --with-deps chromium` → `pnpm build` → run e2e
  against the in-memory/local-uploads host app. Hermetic — **no Mongo service, no
  secrets**. Playwright artifacts (trace/screenshot on failure) uploaded for triage.
- **Bundle budget stays confirm-only.** `pnpm size` keeps its existing **300 kB**
  ceiling unchanged; the milestone's "tighten/confirm" resolves to **confirm** — the
  build must stay under the ceiling. (Pinning to a measured baseline is explicitly not
  done this cycle.)

### §4 — Release workflow + runbook

A new **`.github/workflows/release.yml`** triggered on **`v*` tag push**:

```yaml
on: { push: { tags: ['v*'] } }
jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - checkout / pnpm / setup-node (registry-url npm)
      - pnpm install --frozen-lockfile
      - pnpm build
      - pnpm exec changeset publish      # publishes pkgs whose version isn't on npm
        env: { NODE_AUTH_TOKEN / NPM_TOKEN }
```

Publishing the **6 public `@airnauts/comments-*` packages** (examples + test-support
are in the Changesets `ignore` list, so they never publish). The workflow runs **build
+ tests before publish** (or is gated on a green CI run for the same commit) so a
broken tag can't ship.

**Release runbook** (documented in the repo — `docs/` or a `RELEASING.md`):

1. `pnpm version-packages` — consumes the pending `initial-release.md` changeset and
   writes the bumped versions + changelogs.
2. Commit the version bump to `main`.
3. `git tag vX.Y.Z` matching the new version; `git push --tags`.
4. The workflow runs `changeset publish`, which publishes any package whose
   `package.json` version is not yet on the registry.

**Two prerequisites flagged (setup, not blockers for the spec/plan):**

- **`NPM_TOKEN`** must be added as a repo/org Actions secret with publish rights to the
  `@airnauts` scope **before the first tag**. The plan will note this as a manual
  pre-step.
- **First-release versioning reconciliation.** Packages already sit at `0.1.0` **and**
  there is an unconsumed `initial-release.md` changeset. Running `version-packages`
  will bump *past* `0.1.0` (a `minor` from `0.1.0` → `0.2.0` under Changesets' pre-1.0
  rules unless the changeset is `patch`). The runbook step in the plan will **pin
  exactly what the first published version is** — either by adjusting/removing the
  pending changeset so the first publish is `0.1.0`, or by accepting the bump and
  tagging the resulting version. Decided in the plan against the then-current
  `.changeset/` state.

## Out of scope

- **Live dogfood deployment** (Vercel + Atlas + Blob) and **real-project adoption** —
  **M11**. PRD §7's adoption bar lands there.
- **Cross-browser e2e** (Firefox/WebKit), **Mongo-backed e2e**, **visual-regression /
  screenshot-diffing** — post-v1 if needed.
- **Tightening the bundle budget to a measured baseline** — confirm-only this cycle.
- Any package feature, schema, or endpoint change.

## Exit criteria

- Playwright e2e covers the table in §1 and passes **headless in CI** against
  `examples/nextjs-host` on the in-memory/local-uploads fallback, Chromium only.
- The **DOM-mutation** cases pass via the §2 host-app variants: reorder/rename/wrap
  **re-anchor**, remove **orphans**.
- CI (lint · typecheck · build · test · **e2e** · size · exports) is green on PR + push
  to `main`; `pnpm size` confirms the build under **300 kB**.
- `release.yml` exists and, on a `v*` tag, runs build + `changeset publish`; the
  **release runbook** is documented; `NPM_TOKEN` prerequisite and first-version
  reconciliation are recorded for the operator.
- A new **M11** is added to `milestones.md` carrying the deferred dogfood deployment +
  real-project adoption (and PRD §7's adoption acceptance bar).

## Sequencing

1. **Now:** spec (this doc) approved + committed.
2. **Blocked on:** author pushes the repositories/storages refactor to `main`.
3. **Then:** `git merge --ff-only main` into the M10 worktree, re-read the refactored
   fallback seams, and invoke **writing-plans** against the current code.
4. **Implement** §1–§4 + the `milestones.md` M10→done / M11-added edit.

## References

- Milestones [`milestones.md`](../../milestones.md) §M10 (this cycle slims + adds
  release; deferred tail → new §M11).
- M9 design [`2026-06-01-m9-integration-host-app-design.md`](2026-06-01-m9-integration-host-app-design.md)
  (the host app + manual smoke checklist this milestone automates).
- Architecture §9 (testing strategy); PRD §7 (success criteria).
- Publish prep: ADR-0020 (`@airnauts` scope, Changesets, 6 public packages).
