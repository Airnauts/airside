# Releasing `@airnauts/comments-*`

Packages are published to npm by [`.github/workflows/release.yml`](.github/workflows/release.yml),
triggered by pushing a `v*` tag. Versioning is managed by [Changesets](https://github.com/changesets/changesets).

## Prerequisite (one-time)

Add an **`NPM_TOKEN`** Actions secret (organization or repository) with **publish**
rights to the `@airnauts` scope:
repo → Settings → Secrets and variables → Actions → New repository secret.

### First release (now)

The two initial changesets have already been consumed on `main` (`chore: version
packages`), so **all 8 public packages are at `0.1.0`** with no pending changesets and
nothing is published yet. To cut the first release, just tag the current version:

```bash
git tag v0.1.0
git push && git push --tags
```

The **Release** workflow runs the gates (lint · typecheck · build · test) and
`changeset publish`, publishing all 8 packages at `0.1.0`. Verify:

```bash
npm view @airnauts/comments-core version
```

### Subsequent releases

1. Ensure `main` is green and the changes you want to ship carry **changesets**
   (`pnpm changeset` per change — committed alongside the work).
2. Bump versions + changelogs from the pending changesets:
   ```bash
   pnpm version-packages   # = changeset version
   ```
3. Commit the version bump:
   ```bash
   git add -A && git commit -m "chore(release): vX.Y.Z"
   ```
4. Tag and push (match the bumped version):
   ```bash
   git tag vX.Y.Z
   git push && git push --tags
   ```
5. The **Release** workflow gates and `changeset publish`es the packages whose version
   is not yet on the registry.

## Public packages (8)

`core`, `client`, `server`, `next`, `adapter-memory`, `adapter-mongo`, `storage-fs`,
`storage-vercel-blob`.

The examples (`nextjs-host`, `playground`) and `test-support` are private /
Changesets-ignored and never publish.
