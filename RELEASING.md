# Releasing `@airnauts/airside-*`

Publishing is **automatic on `main`**: the `publish` job in
[`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs on every push to `main`,
**after** the `ci` and `e2e` jobs pass, and runs `changeset publish`. That command is
**idempotent** — it publishes only packages whose `package.json` version is **not already
on npm**, so a push without a version bump is a safe no-op. Versioning is managed by
[Changesets](https://github.com/changesets/changesets).

**In short: to release, land a version bump on `main`.** No tags required.

## Prerequisite (one-time)

Add an **`NPM_TOKEN`** Actions secret (organization or repository) with **publish**
rights to the `@airnauts` scope:
repo → Settings → Secrets and variables → Actions → New repository secret.

## First release (now)

The initial changesets have already been consumed on `main` (`chore: version packages`),
so the public packages are versioned (currently **`0.1.0`**, except
`@airnauts/airside-client` at **`0.1.1`**) with no pending changesets and nothing is
published yet. The first green push to `main` (with `NPM_TOKEN` set) publishes all 8 at
their current versions automatically. Verify:

```bash
npm view @airnauts/airside-core version
```

(If you want to publish the current `main` state without waiting for another push, re-run
the latest **CI** workflow run on `main` from the Actions tab.)

## Subsequent releases

1. Each change that should ship carries a **changeset** (`pnpm changeset`, committed
   alongside the work).
2. When ready to release, bump versions + changelogs from the pending changesets:
   ```bash
   pnpm version-packages   # = changeset version
   ```
3. Commit the version bump and merge it to `main`:
   ```bash
   git add -A && git commit -m "chore(release): vX.Y.Z"
   ```
4. Once that lands on `main` and **ci + e2e** are green, the `publish` job publishes the
   packages whose version is not yet on the registry. No tagging step.

> Tip: keep the version bump (`pnpm version-packages`) as its **own** commit/PR so the
> publishing push is a deliberate, reviewable step rather than a side effect of unrelated
> work.

## Public packages (8)

`core`, `client`, `server`, `next`, `adapter-memory`, `adapter-mongo`, `storage-fs`,
`storage-vercel-blob`.

The examples (`nextjs-host`, `playground`) and `test-support` are private /
Changesets-ignored and never publish.
