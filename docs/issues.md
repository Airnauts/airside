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
  ./app/api/airside/[...path]/route.ts
```

**Root cause.** `mongodb` loads its optional native deps (`aws4`, `kerberos`,
`mongodb-client-encryption`, `snappy`, `@mongodb-js/zstd`, …) through guarded
dynamic `require()`s wrapped in `try/catch` — see
`mongodb/lib/deps.js` (`loadAws4()` etc.). Those deps are only reached if you
enable AWS/Kerberos auth, client-side encryption, or compression; none are
installed, and at runtime the missing-module error is caught and ignored.

webpack can't see the `try/catch`, so when it statically traces the module graph
it reports the unresolved `require('aws4')` as a warning. The trace reaches
`mongodb` because `@airnauts/airside-adapter-mongo` does a top-level **value**
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

## Text-selection highlight is misaligned after window resize

**Status:** open — bug.

**Symptom.** The highlight rectangles drawn over selected text drift away from
the text they belong to after the browser window is resized. In the captured
example the blue highlight boxes sit well to the left of (and above) the actual
selected words instead of covering them — the overlay no longer tracks the live
DOM geometry. See `docs/screenshots/selection-off-after-resize.png`.

**Likely root cause (unconfirmed).** Selection highlight rects appear to be
computed once (e.g. cached `getBoundingClientRect()` / `Range` rects at selection
time) and not recomputed on `resize` (and probably not on scroll or reflow
either). When the layout reflows on resize, the cached coordinates go stale.

**Expected.** Highlight rects should be recomputed against the current DOM
geometry on resize/reflow so they stay locked to their text.

## Selection highlight is not shown when its thread is opened

**Status:** open — bug / missing behavior.

**Symptom.** Opening a thread does not surface the text selection that the
comment anchors to — there's no visual link between the open thread and the
highlighted range in the document.

**Expected.** When a thread is opened, its associated selection should be
rendered/visible so the reader can see exactly what the comment refers to.

## Signal-less element cannot re-anchor under structural mutation

**Status:** open — known limitation of the v1 scoring policy. Surfaced by the M10 e2e.

**Symptom.** An element pin placed on a plain `<li>` (no `id`, `class`, `role`,
`data-*`, or `data-testid`) **orphans** when the page reloads with the list wrapped in
an extra container (`?variant=wrapped` in the e2e article page). The positional selector
(`li:nth-of-type(2)`) breaks under wrapping, re-match falls to the scored path, and the
element scores below the accept threshold.

**Root cause.** `packages/core/src/anchor/weights.ts`:
`stableAttrs 0.40 · text 0.25 · classes 0.15 · role 0.10 · sibling 0.05 · ancestor 0.05`,
`accept = 0.60`. A signal-less element's maximum score is `text + sibling + ancestor =
0.35`, below `accept`, so `decide()` returns `orphaned: belowAccept`. The ceiling is
strict: even `text + classes (0.40)` is still below — **only a stable attribute (`id` or
a `data-*`, weight 0.40) lifts a content element over the line** (`0.25 + 0.40 = 0.65`).
Selectors are built only from `id`/`data-testid`, so a non-id `data-*` raises the score
without making the selector survive wrapping — the only way a content element re-anchors
via the **scored** path.

**Impact.** Pins on generic structural elements (bare `<li>`, `<div>`, short-text `<p>`)
don't survive wrapper/restructuring mutations; they orphan. Targets with an `id`, a
`data-*`, or distinctive longer text fare better. May be acceptable v1 behavior, or may
warrant revisiting the weight/threshold calibration (the M2b scoring corpus).

**How the e2e relates.** The mutation re-anchor tests give the target `<li>` a
`data-anchor` attribute so the scored re-anchor path is exercised above threshold; the
bare-element ceiling is documented here rather than asserted.

## Tag-only fast-path agreement produces a confidently-wrong pin on sibling removal

**Status:** open — correctness bug (more serious than the re-anchor ceiling above).
Surfaced by the M10 e2e.

**Symptom.** An element pin on a plain `<li>` whose anchored node is **removed**
(`?variant=removed`) does not always orphan — for a signal-less element the pin can
re-anchor onto the **wrong surviving sibling**, i.e. a confidently-wrong pin.

**Root cause.** `packages/client/src/anchor/rematch.ts` `signalsAgree()` checks only tag
+ `stableAttrs`. For a signal-less element `stableAttrs` is empty, so it returns `true`
on a **tag match alone**. When the original `<li>` is removed, the stored positional
selector `li:nth-of-type(2)` re-resolves (uniquely) onto the next surviving `<li>`;
`resolveUnique` hits it, `signalsAgree` accepts it on tag, and `finishMatch` anchors the
pin there. Element anchors have no `selection` quote to disambiguate, so nothing catches
the substitution.

**Impact.** Exactly the "a confidently wrong pin is worse than an honest needs-review"
failure the product copy warns against: a reviewer's comment silently moves to a
different element after the original is deleted. Trust-eroding for the re-anchor
guarantee in PRD §7.

**Validated fix (deferred — not applied).** Require a corroborating signal beyond tag
before the fast path accepts when the stored element had no `stableAttrs` (e.g. fall
through to scoring, or require minimum text/structural agreement). Backend/client logic
is built test-first (ADR-0010), so this wants a failing rematch test first (bare element
+ removed sibling ⇒ `orphaned`), then the guard.

**How the e2e relates.** The orphan test gives the target a `data-anchor` so
`signalsAgree` rejects the wrong sibling; the bare-element mis-anchor is documented here.
