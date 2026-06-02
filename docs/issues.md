# Known issues

A running log of known, non-blocking issues — things that work today but have a
rough edge we've chosen to defer. Each entry records the symptom, the root cause,
and a validated fix so we can act on it deliberately later.

## mongodb optional-dep build warning in the Next.js host

**Status:** open — deferred (build succeeds; warning is cosmetic).

**Symptom.** Building `examples/nextjs-host` prints a webpack warning and still
compiles successfully:

```
⚠ Compiled with warnings
../../node_modules/.pnpm/mongodb@6.21.0/node_modules/mongodb/lib/deps.js
Module not found: Can't resolve 'aws4' in '.../mongodb/lib'

Import trace for requested module:
  .../mongodb/lib/deps.js
  .../mongodb/lib/client-side-encryption/client_encryption.js
  .../mongodb/lib/index.js
  ../../packages/adapter-mongo/dist/index.js
  ./app/api/comments/[...path]/route.ts
```

**Root cause.** `mongodb` loads its optional native deps (`aws4`, `kerberos`,
`mongodb-client-encryption`, `snappy`, `@mongodb-js/zstd`, …) through guarded
dynamic `require()`s wrapped in `try/catch` — see
`mongodb/lib/deps.js` (`loadAws4()` etc.). Those deps are only reached if you
enable AWS/Kerberos auth, client-side encryption, or compression; none are
installed, and at runtime the missing-module error is caught and ignored.

webpack can't see the `try/catch`, so when it statically traces the module graph
it reports the unresolved `require('aws4')` as a warning. The trace reaches
`mongodb` because `@airnauts/comments-adapter-mongo` does a top-level **value**
import — `import { ..., MongoClient } from 'mongodb'` in
`packages/adapter-mongo/src/repository.ts`. That single value import pulls
`mongodb/lib/index.js` → `client-side-encryption` → `deps.js`. (The other mongodb
imports in that file — `Db`, `Filter`, `UpdateFilter` — are `import type` and are
erased at build, so they contribute nothing to the trace.)

**Why the obvious host fix doesn't work.** `serverExternalPackages: ['mongodb']`
in `next.config.ts` does *not* suppress the warning here — webpack still bundles
mongodb through the transitive pnpm-workspace import from the adapter's `dist`, so
the externalization simply isn't matching.

**Impact.** None at runtime. The build completes; Mongo works normally. The
warning is log noise only.

**Validated fix (deferred — not applied).** Make the driver load lazily in the
adapter so no bundler ever statically traces into `mongodb`. In
`packages/adapter-mongo/src/repository.ts`:

- Move `MongoClient` from the value import to the type-only import
  (`import type { Db, Filter, UpdateFilter } from 'mongodb'`).
- Load the constructor lazily at its only use site (`connectMongo`, already
  `async`):

  ```ts
  const { MongoClient } = await import(/* webpackIgnore: true */ 'mongodb')
  const client = new MongoClient(uri)
  ```

The `webpackIgnore` magic comment keeps it a plain runtime import. Verified in a
throwaway worktree build:

- `tsup`/esbuild preserves the `webpackIgnore` comment in `dist/index.js` and
  emits no static `from "mongodb"`.
- `examples/nextjs-host` then builds with no `aws4` / "Module not found" warning.
- `adapter-mongo` tests stay green (33/33, including the `mongodb-memory-server`
  integration test exercising the dynamic-import → `new MongoClient` path);
  typecheck clean.

**Trade-off to weigh before landing.** Couples the library to a webpack-specific
magic comment and defers the mongodb load to first connect (harmless for a
server-only driver, arguably an improvement). Because it's a deliberate
bundler-compat decision, landing it should come with a short ADR note.

A purely host-side alternative (a webpack `IgnorePlugin` for the optional deps in
`next.config.ts`) also works but only fixes this one example app, not every
downstream consumer — hence the adapter-side fix is preferred when we act.
