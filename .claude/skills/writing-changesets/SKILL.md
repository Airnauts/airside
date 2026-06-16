---
name: writing-changesets
description: Use when recording package changes for a release in the commeting-tool monorepo (Changesets) — asked to "update a changeset", "add a changeset", "record changes for the changelog", decide a patch/minor/major version bump, or prep a publishable package change before release or publish.
---

# Writing Changesets

## Overview

Changelogs in this repo are **generated from changeset files**, never hand-edited
(see CLAUDE.md → "Changelog: managed by Changesets"). A changeset is a small
markdown file under `.changeset/` that names the affected publishable packages, a
semver bump for each, and a user-facing summary. `pnpm version-packages` later turns
those files into version bumps + `CHANGELOG.md` entries.

You write the changeset file **by hand** — never run the interactive `pnpm changeset`
add command, it requires a TTY and hangs in this environment.

## When to write one — and when NOT to

Write a changeset only when a **publishable** package's shipped behavior changed.

These eight are publishable:

| `@airnauts/airside-` | dir |
|---|---|
| core, server, client, next | `packages/{core,server,client,next}` |
| adapter-memory, adapter-mongo | `packages/adapter-{memory,mongo}` |
| storage-fs, storage-vercel-blob | `packages/storage-{fs,vercel-blob}` |

**No changeset** (and say so — silence reads as "forgotten") when the only changes are:
- `packages/test-support`, `examples/nextjs-host`, `examples/playground` — these are
  `private` **and** in `.changeset/config.json`'s `ignore` list. Writing a changeset that
  names an ignored package makes `pnpm version-packages` **error out**.
- Docs, root config, CI, tooling, or tests with no shipped effect.

## Bump policy — pre-1.0 (all packages are 0.x today)

Under `^0.1.0`, npm already treats a `0.2.0` as breaking. So while we are pre-1.0 we
**stay in 0.x**: a breaking change is a `minor`, not a `major` (a `major` would jump to
`1.0.0`). Revisit when we intentionally cut 1.0 (tied to CLAUDE.md's beta note).

| Change to the package's own public API | Bump now (0.x) | After 1.0 |
|---|---|---|
| Breaking (rename/remove/signature change) | `minor` | `major` |
| Backwards-compatible feature (e.g. new optional field) | `patch` | `minor` |
| Bug fix / shipped internal change | `patch` | `patch` |

Judge each package by **its own** API surface. Do **not** add entries for internal
dependents — `updateInternalDependencies: "patch"` auto-bumps every workspace dependent
and writes their "Updated dependencies" lines at version time. Listing them double-counts.

## Recipe

1. **Find what changed.** Prefer the working-tree diff (`git status`, `git diff`). If the
   tree is clean, use commits since the last version bump: `git log <last "chore: version packages" commit>..HEAD --stat` (releases create no tags, so there's no release tag to diff against).
   Map each changed file under `packages/<dir>/` to its package via the table above.
2. **Keep only publishable packages.** Drop ignored/private packages and non-shipping
   changes. If nothing publishable remains → no changeset; tell the user.
3. **Pick a bump per package** from the policy table, judging each package's own API.
4. **Write one file per logical change** (granular changelog beats one giant entry) at
   `.changeset/<short-kebab-slug>.md`:
   ```md
   ---
   "@airnauts/airside-core": patch
   "@airnauts/airside-server": minor
   ---

   Add an optional `pinned` flag to the Comment schema; the server now rejects
   pins on resolved threads. Existing payloads validate unchanged.
   ```
   Summary = **for the changelog reader** (someone adopting the package): the
   user-visible effect, present tense — not "refactored X" git-log narration.
5. **Verify the plan:** `pnpm changeset status --verbose` prints the resulting versions
   (including the auto-patched dependents). Confirm it matches intent. (Do **not** use
   `--since=main` — we develop on `main`, so HEAD *is* main and it finds nothing.)

"Update the changeset" means: if a pending `.changeset/*.md` already covers this work,
edit it; otherwise add a new file. Don't duplicate coverage of the same change.

## Common mistakes

| Mistake | Reality |
|---|---|
| Running interactive `pnpm changeset` | Hangs (needs TTY). Write the `.md` by hand. |
| Adding an entry for test-support / examples | They're ignored → `version-packages` errors. |
| Bumping internal dependents by hand | Auto-patched by `updateInternalDependencies`. |
| `major` for a breaking change | We're pre-1.0 → use `minor` (major jumps to 1.0.0). |
| One mega-changeset for unrelated changes | One file per logical change. |
| Git-log summary ("refactor anchor scoring") | Write the consumer-visible effect. |

## Quick reference

- Add: write `.changeset/<slug>.md` (frontmatter packages+bumps, then summary).
- Verify: `pnpm changeset status --verbose`.
- Release is **automatic on push to `main`** (the `publish` job in `.github/workflows/ci.yml`,
  after `ci` + `e2e` pass): it runs `changeset publish`, which publishes only versions not yet
  on npm — **no tags**. To cut a release, land a `pnpm version-packages` bump on `main`. Your
  job is the changeset; the full release procedure lives in `RELEASING.md`.
