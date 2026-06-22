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

## Text-selection highlight drifts off its text on scroll and window resize

**Status:** resolved — fixed in `ffb3da1`.

**Symptom.** The highlight rectangles drawn over a thread's selected text drift
away from the text they belong to when the page is **scrolled** or the browser
window is **resized**. In the captured examples the blue highlight boxes sit well
to the left of (and above) the actual selected words instead of covering them —
the highlight no longer tracks the live DOM geometry, even though the pin itself
stays put. See `docs/screenshots/selection-off-after-scroll.png` (scroll) and
`docs/screenshots/selection-off-after-resize.png` (resize).

**Root cause (confirmed).** Highlight rects are computed **once, at match time**
and then reused unchanged on every reposition emit, while the pin coordinate is
recomputed live — so the two diverge on scroll/resize.

- The highlight `Box[]` is produced only inside `matchAndReport`
  (`packages/client/src/anchor/runtime.ts:75-76`): `mapRects(range.getClientRects())`
  for an `anchored` result. It is stored on the retained match and never touched
  again until the next *rematch*.
- Every emit goes through `toPlacedThread` (`runtime.ts:24-27`), which recomputes
  `pin` from a fresh `p.el.getBoundingClientRect()` but passes the stored
  `p.highlight` through verbatim.
- `reposition` is just `emit` (`runtime.ts:146`), and the scroll/resize listeners
  wire `onReposition → rt.reposition()` (`packages/client/src/marker/MarkerLayer.tsx:109-112`).
  So a scroll or resize re-emits with a **live pin but stale highlight rects**.
  (DOM-mutation reflows instead go through `onMutation → rt.rematchAll()`, which
  *does* recompute the highlight — which is why the drift is specific to
  scroll/resize.)

**Expected.** Highlight rects should track the current DOM geometry on
scroll/resize the same way the pin does, staying locked to their text.

**Validated fix (deferred — not applied).** Retain the matched `Range` on the
`RetainedMatch` and recompute `mapRects(range.getClientRects())` inside
`toPlacedThread` on each emit (mirroring the live `getBoundingClientRect()` already
done for the pin), rather than caching `highlight` once at match time. Client
anchoring logic is built test-first (ADR-0010), so this wants a failing
runtime/reposition test (highlight rects move with the element on a reposition
emit) before the change.

## Selection highlight is not shown when its thread is opened

**Status:** open — bug / missing behavior.

**Symptom.** Opening a thread does not surface the text selection that the
comment anchors to — there's no visual link between the open thread and the
highlighted range in the document.

**Expected.** When a thread is opened, its associated selection should be
rendered/visible so the reader can see exactly what the comment refers to.

## Thread's page URL renders twice because the page title is never captured

**Status:** open — rough edge (cosmetic; fix is small).

**Symptom.** In the sidebar detail's page-context card the same URL appears on both
lines — a bold line and a gray line — instead of "Page Title" over "URL". Seen on
`https://dev.catalog.lear.com/` (see `docs/screenshots/`).

**Root cause.** Two parts, one underlying cause:

- The card renders `pageTitle ?? pageUrl` (bold) over `pageUrl` (gray) —
  `packages/client/src/ui/ThreadConversation.tsx:108-115` (same fallback in
  `panel/PanelRow.tsx:21`). With `pageTitle` present this reads title-over-URL; with it
  absent the bold line falls back to the URL, so the URL shows twice.
- `pageTitle` is **always** absent. The schema accepts it
  (`packages/core/src/contract/requests.ts:21`, `schemas/thread.ts:26`), but the client's
  `createThread` body never sends it — `packages/client/src/marker/MarkerLayer.tsx:137-145`
  passes `pageUrl`, `pageKey`, `anchor`, `comment`, `author`, `captureContext`,
  `provenance` and no `pageTitle`. So every thread stores `pageTitle: undefined` and the
  fallback always triggers.

**Impact.** Cosmetic only — the card is still informative (URL is shown), just redundant
and missing the friendlier page title. No data or anchoring effect.

**Validated fix (deferred — not applied).** Capture the title at create time: add
`pageTitle: document.title` (trimmed; omit when empty) to the `createThread` body in
`MarkerLayer.tsx`. Backend/core is built test-first (ADR-0010), but the schema field
already exists, so this is a client-only change — exercise it via the marker/create path.
Optionally also guard the render so the gray URL line is hidden when `pageTitle` is absent
or equals `pageUrl`, so old threads with no captured title stop double-printing. Note an
empty `document.title` (`""`) would make the bold line render *blank* rather than the URL,
so trim-and-omit rather than passing `""`.

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

## Place mode drops a pin on the widget's own launcher and panel chrome

**Status:** resolved — fixed in `12a6fbc`.

**Symptom.** With "Add comment" (place mode) active, clicking the launcher pill or
the comments sidebar **places a pin on the widget's own chrome** instead of
behaving normally. Clicking the ☰ panel button should open/close the sidebar;
clicking the active ✎ place button should exit place mode; clicking inside the
open sidebar should interact with it. Instead each of those drops a draft pin.

**Root cause.** The place-mode click guard in
`packages/client/src/marker/usePlacingMode.ts:16-24` only bails out for two
things: a target whose dataset has `commentsPlace`, or a target inside
`[data-airside-overlay]`. Both checks miss the launcher and the panel:

- **Stale rebrand attribute.** The guard checks `target.dataset?.commentsPlace`
  (i.e. `data-comments-place`), but the launcher's place button now renders
  `data-airside-place` → `dataset.airsidePlace`
  (`packages/client/src/ui/Launcher.tsx:49`). The rebrand (comments→airside,
  ADR-0038) renamed the attribute on the button but not the key the guard looks
  for, so `commentsPlace` is **never set anymore** and the check is dead. Clicking
  the active place button therefore captures an anchor and places a pin instead of
  toggling place mode off — and because the listener runs in the capture phase and
  calls `e.stopPropagation()`, it also kills the React `onClick` toggle.
- **Launcher and panel aren't marked as overlay.** `data-airside-overlay` only sits
  on the pin layer (`packages/client/src/positioning/layer.tsx:21`) and the draft
  popover (`marker/DraftPopover.tsx:29`). The launcher
  (`ui/Launcher.tsx`) and the panel drawer (`panel/PanelDrawer.tsx`, rendered with
  `data-testid="airside-panel"`) carry no overlay marker, so `target.closest(
  '[data-airside-overlay]')` never matches them and clicks fall through to pin
  placement.

**Impact.** Place mode is hard to exit (clicking the ✎ button to turn it off
instead drops a pin), and the launcher/sidebar can't be operated while placing —
exactly the controls a user reaches for to bail out. No data corruption, but it
makes place mode feel broken.

**Validated fix (deferred — not applied).** Extend the guard to ignore any click
that lands inside the widget's own chrome, not just the overlay layers — e.g. mark
the launcher and panel with `data-airside-overlay` (or a shared
`data-airside-chrome` marker) and have the guard skip
`target.closest('[data-airside-overlay], [data-airside-chrome]')`, and repair the
dead place-button check (use `dataset.airsidePlace`, or drop it in favour of the
chrome marker on the launcher). Then clicking the launcher/sidebar in place mode
behaves "like without add pin mode". Client logic is built test-first (ADR-0010),
so this wants a failing `usePlacingMode` test (a click on launcher/panel chrome
does not dispatch `SET_DRAFT`) first.

## Cross-element text selection (across `</code>`) anchors to a generic ancestor and is lost on re-render

**Status:** open — bug. Same root forces as the two anchoring issues above
("Signal-less element cannot re-anchor under structural mutation" and "Tag-only
fast-path agreement produces a confidently-wrong pin on sibling removal").

**Symptom.** In the playground, selecting text that **crosses an element
boundary** — e.g. starting inside `<code>?airside-key=dev-key</code>` and ending in
the text node after `</code>` ("…dev-key**</code> to activate**…") — produces a
comment whose anchor is lost almost immediately: the open thread shows the ⚠ "This
comment's anchor was lost" card (or the highlight silently jumps to a different
paragraph). A selection kept **inside** a single element (e.g. wholly within
`<code>`) does not have this problem.

**Root cause (confirmed via a jsdom repro of the exact markup).** `captureSelection`
anchors to `range.commonAncestorContainer` (`packages/client/src/anchor/capture.ts:40-46`).
For a selection inside one element the common ancestor *is* that distinctive leaf
(`<code>`); for a selection that crosses `</code>` it is the **enclosing block**
(a bare, signal-less `<p>`). The two then re-anchor very differently:

- **In-`<code>`** → `selectors = ['… > code', 'code']`, `signals.tag = 'code'`. The
  distinctive `code` selector stays unique even when sibling order shifts, so the
  fast path re-anchors → `anchored`.
- **Cross-`</code>`** → `selectors = ['article > p:nth-of-type(3)', 'p']`,
  `signals.tag = 'p'`. The `<p>` has no `id`/`class`/`data-*`, so:
  - a sibling shift (host re-render that inserts/reorders a paragraph) makes the
    stored `nth-of-type` selector resolve to the **wrong** `<p>`, which
    `signalsAgree` accepts on tag alone → `finishMatch` can't find the quote there →
    `selectionLost` (the pin silently moves to a different paragraph, highlight
    dropped) — the *tag-only fast-path* failure mode;
  - a wrapper/restructure (host moves the copy into a new container) makes both
    stored selectors miss, so the scored path runs and a signal-less `<p>` caps at
    `text + sibling + ancestor = 0.35 < 0.60` accept → `orphaned: belowAccept` → the
    ⚠ "anchor lost" card — the *signal-less* failure mode.

On a **static** DOM (the bare playground with no host re-render) every case
re-anchors fine, so the trigger is a DOM mutation between capture and the
create-time `refresh()` rematch — routine on a React/CMS host like the live
catalog the screenshots come from.

**Impact.** Cross-element selections are far more fragile than in-element ones
because they bind to a generic ancestor rather than the distinctive leaf the user
actually started in. The user perceives it as "select across a tag → instantly
anchor lost". Trust-eroding (PRD §7), and the `selectionLost`→wrong-paragraph
variant is a confidently-wrong pin.

**Validated fix (deferred — not applied).** Prefer a more distinctive anchor host
than the raw common ancestor when a selection spans elements — e.g. anchor to the
start endpoint's element (the leaf the selection began in) and resolve the quote
relative to it, or climb to the nearest element with a stable signal — so a
cross-boundary selection doesn't degrade to a bare block. Pairs naturally with
fixing the tag-only fast path (require a corroborating signal before accepting a
signal-less element). Built test-first (ADR-0010): add the failing capture/rematch
case (cross-`</code>` selection survives a sibling shift) before the change.
