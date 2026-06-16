# Changesets

This folder holds [changesets](https://github.com/changesets/changesets) — one
markdown file per intended release describing which packages bump and how.

Workflow:

1. `pnpm changeset` — record an intent (pick packages + bump type, write a summary).
2. `pnpm changeset version` — apply pending changesets: bump versions, update
   internal dependency ranges, and regenerate each package's `CHANGELOG.md`.
3. `pnpm release` — build everything, then `changeset publish` to npm in
   dependency order.

Private packages (`@airnauts/airside-test-support`, the `examples/*` apps) are
ignored automatically.
