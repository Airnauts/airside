# CLAUDE.md

This project is an **embeddable commenting tool** (v1). The repository currently
holds the design; application code is built against that spec. The design is the
source of truth — read it before implementing, and point to it rather than
restating it here:

- `docs/prd.md` — product requirements.
- `docs/architecture.md` — the integrated v1 system architecture (start here).
- `docs/adr.md` — the per-decision rationale log (ADR-0001…).
- `docs/milestones.md` — delivery milestones.

## Development practices

### Backend is built test-first (TDD)

The backend packages — `core`, `server`, and the persistence/storage adapters
(see architecture §2) — are built **test-first** (ADR-0010): write the failing
test or fixture before the implementation it covers, then red → green → refactor.
In particular, `core`'s pure logic (zod schemas, `pageKey` normalization, the
scoring/threshold policy) and the shared adapter contract suite are authored as the
executable spec first. Client/widget testing follows architecture §9, not strict TDD.

### Branching: develop on `main` until beta

Until the beta release, commit development work **directly to `main`** — no
feature-branch or pull-request workflow is required. Milestones are still built one
at a time (brainstorm → spec → plan → implement); they just land on `main`.
Revisit this once we cut the beta.

### Changelog: managed by Changesets

Per-package `CHANGELOG.md` files are **generated**, never hand-edited. The release
machinery is [Changesets](https://github.com/changesets/changesets) (`.changeset/config.json`,
`access: public`, base branch `main`); the changelog is the default
`@changesets/cli/changelog` renderer.

The rule: **any change that affects a publishable package must ship with a changeset.**
The changeset is what populates the changelog — no changeset, no changelog entry, and
the package won't be versioned or released.

- **While working** — after a change that users of a package would care about, run
  `pnpm changeset`, select the affected package(s), pick the bump (`patch` / `minor` /
  `major` per semver), and write a one-line, user-facing summary. This drops a markdown
  file under `.changeset/` that you commit alongside the code.
- **Bumping versions** — `pnpm version-packages` (`changeset version`) consumes the
  pending `.changeset/` files, bumps each affected `package.json`, and **appends the
  summaries to each package's `CHANGELOG.md`**. Commit the result (e.g.
  `chore: version packages`).
- **Releasing** — **automatic on push to `main`**: the `publish` job in
  `.github/workflows/ci.yml` runs after `ci` + `e2e` pass and calls `changeset publish`
  (idempotent — only publishes versions not yet on npm). To release, land a
  `pnpm version-packages` bump on `main`; **no tags**. Full procedure (first release,
  `NPM_TOKEN` prerequisite) in `RELEASING.md`. (`pnpm release` still publishes locally
  as a fallback.)

The eight publishable `@airnauts/airside-*` packages get changelogs; the three ignored
workspaces (`airside-test-support`, `airside-nextjs-host`, `airside-playground` in
`.changeset/config.json`) do not — don't write changesets for them.

Write summaries for the **changelog reader** (someone adopting the package), not as a
git log: describe the user-visible effect, not the internal refactor.

For the per-change mechanics (file format, the pre-1.0 bump policy, which packages to
include), use the `writing-changesets` skill in `.claude/skills/`.

## Architecture decision records

`docs/adr.md` is the running log of architecture decisions for this project. Whenever an architecturally significant choice is made or changed.

### When to add an ADR

Add an ADR when a decision is difficult to change later. Specifically, write one when you:

- Choose a framework, language, or database.
- Define communication protocols (e.g., REST vs. gRPC).
- Establish coding standards or architectural patterns.
- Introduce a change with significant trade-offs.

### What each record captures

Keep entries newest-last, and for each record capture:

- **Title and date** (use the current date).
- **Status** — proposed / accepted / superseded (note which record supersedes it).
- **Context** — the problem and the forces in play.
- **Decision** — what was chosen.
- **Consequences** — trade-offs and follow-on implications.

Don't edit decided history in place: to reverse a past decision, add a new record that supersedes the old one rather than rewriting it.
