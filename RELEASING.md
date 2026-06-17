# Releasing `@airnauts/airside-*`

Publishing is **automatic on `main`**: the `publish` job in
[`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs on every push to `main`,
**after** the `ci` and `e2e` jobs pass, and runs `changeset publish`. That command is
**idempotent** — it publishes only packages whose `package.json` version is **not already
on npm**, so a push without a version bump is a safe no-op. Versioning is managed by
[Changesets](https://github.com/changesets/changesets).

**In short: to release, land a version bump on `main`.** No tags required.

## Prerequisite

An **`NPM_TOKEN`** Actions secret with **publish** rights to the `@airnauts` scope must
exist (repo → Settings → Secrets and variables → Actions). This is **already configured** —
the CI `publish` job has shipped every release through the current `0.9.0`. Only revisit it
if the token is rotated or revoked.

## Current state

All **13** public packages are released and **version-synced** at **`0.9.0`** (live on
npm), with no pending changesets. The packages share one version because they're a
Changesets [`fixed`](.changeset/config.json) group: any release bumps all 13 together. The
machinery has been exercised continuously from `0.1.0` through `0.9.0`.

Verify the live version of any package:

```bash
npm view @airnauts/airside-core version
```

## Cutting a release

1. Each change that should ship carries a **changeset** committed alongside the work
   (`pnpm changeset`, then pick the bump). Pre-1.0 the bump policy is: breaking changes →
   **minor**, everything else → **patch** (see the `writing-changesets` skill for the
   mechanics and which packages to include).
2. When ready to release, consume the pending changesets to bump versions and append to
   each package's `CHANGELOG.md`:
   ```bash
   pnpm version-packages   # = changeset version
   ```
3. Commit the version bump and land it on `main`:
   ```bash
   git add -A && git commit -m "chore: version packages"
   ```
4. Once that lands on `main` and **ci + e2e** are green, the `publish` job publishes the
   packages whose version isn't yet on the registry. No tagging step.

> Tip: keep the version bump (`pnpm version-packages`) as its **own** commit so the
> publishing push is a deliberate, reviewable step rather than a side effect of unrelated
> work.

> **Never run `npm publish` from a package directory.** It bypasses Changesets and
> publishes the unresolved `workspace:^` dependency ranges, breaking installs. Release
> through the CI `publish` job, or — as a local fallback — `pnpm release`, which runs
> `pnpm build && changeset publish` from the repo root and rewrites the `workspace:*`
> ranges to real versions.

## Public packages (13)

All version-synced via the Changesets `fixed` group:

`core`, `client`, `server`, `integration-next`, `integration-react`, `adapter-memory`,
`adapter-mongo`, `adapter-postgres`, `storage-fs`, `storage-vercel-blob`, `extension-email`,
`extension-slack`, `extension-jira`.

The examples (`nextjs-host`, `playground`) and `test-support` are private /
Changesets-ignored and never publish.
