# Releasing `@airnauts/comments-*`

Packages are published to npm by [`.github/workflows/release.yml`](.github/workflows/release.yml),
triggered by pushing a `v*` tag. Versioning is managed by [Changesets](https://github.com/changesets/changesets).

## Prerequisite (one-time)

Add an **`NPM_TOKEN`** Actions secret (organization or repository) with **publish**
rights to the `@airnauts` scope:
repo → Settings → Secrets and variables → Actions → New repository secret.

## Cutting a release

1. Ensure `main` is green and all intended changesets are merged.
2. Bump versions + changelogs from the pending changesets:
   ```bash
   pnpm version-packages   # = changeset version
   ```
   For the **first release**, all 8 public packages go `0.0.0 → 0.1.0` (the two pending
   `minor` changesets: `initial-release` + `uniform-adapter-construction`).
3. Commit the version bump:
   ```bash
   git add -A && git commit -m "chore(release): vX.Y.Z"
   ```
4. Tag and push:
   ```bash
   git tag vX.Y.Z      # match the bumped version, e.g. v0.1.0
   git push && git push --tags
   ```
5. The **Release** workflow runs the gates (lint · typecheck · build · test) and
   `changeset publish`, publishing the 8 public packages. Verify on npm:
   ```bash
   npm view @airnauts/comments-core version
   ```

## Public packages (8)

`core`, `client`, `server`, `next`, `adapter-memory`, `adapter-mongo`, `storage-fs`,
`storage-vercel-blob`.

The examples (`nextjs-host`, `playground`) and `test-support` are private /
Changesets-ignored and never publish.
