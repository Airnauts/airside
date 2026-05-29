# M6 — Anchoring runtime — design

- **Status:** Approved
- **Date:** 2026-05-29
- **Track:** Frontend · Size: L
- **Source of truth:** [`docs/architecture.md`](../../architecture.md) §7, §9 · ADR-0004, ADR-0008, ADR-0009
- **Depends on:** M2b (scoring policy + fixture corpus, in `@comments/core`), M5 (widget shell + API client)

## Goal

Place an anchor, reload, re-find it — or orphan it. M6 is the defining engine. It
renders **only the positioned pin dot + highlight rect** needed to prove anchoring;
the comment cursor/toolbar, popover, and composer are M7.

## What is already built and reused, not rebuilt

This milestone is mostly *wiring frozen pieces to the real DOM*. The following exist
and are consumed as-is:

- `@comments/core` `anchor/`: `scoreCandidate`, `decide`, `DEFAULT_WEIGHTS`,
  `DEFAULT_THRESHOLDS` (accept ≈ 0.60 / margin ≈ 0.10), `locateQuote` — all pure
  (M2b).
- `@comments/client` `anchor/extract.ts`: `extractSignals(el) -> Signals` — the
  signals bag (M2b).
- `@comments/core` `schemas`: `Anchor` / `Signals` / `Selection` shapes, frozen in
  M2a. M6 produces and consumes these; it does not change them.
- `@comments/client` `api/client.ts`: the M5 API client (key header, optimistic +
  rollback) — used for `createThread`, `listThreads`, and `refreshAnchor` (the
  single re-match reporting endpoint — see below).

The selector strategy (structural nth-of-type + class path), the scoring weights,
the accept/margin thresholds, the `fast-path → scoped scored search → decide`
algorithm, and self-heal-via-`PATCH` are **settled by §7/M2b** and are not redesigned
here.

## The one product decision (made during brainstorm)

**Capture trigger = unified place mode.** The M5 "+ Comment" button stops dropping a
fixed marker and instead toggles *place mode*:

```
[+ Comment]  -> place mode (crosshair cursor)

  has a non-empty text selection?  --yes-->  capture selection anchor
        | no
        v
  next click on the page  -->  capture element anchor

ESC cancels. One button, no toolbar (the polished cursor/toolbar is M7).
```

Both an element pin and a text-selection anchor are required by the exit criteria, so
both capture paths land in M6; the place-mode toggle is the entire trigger surface.

## Architecture — module layout (all in `@comments/client`)

```
src/anchor/
  selectors.ts    buildSelectors(el) -> [structural, class]; resolveSelector(sel, root)
  capture.ts      captureElement(el, point) | captureSelection(range) -> Anchor
  rematch.ts      rematch(anchor, root) -> RematchResult
  runtime.ts      orchestrator: list -> rematch each -> position + refreshAnchor (heal / orphan / selectionLost)
  index.ts        re-exports
src/positioning/
  coords.ts       pure: rect + offset -> overlay coords; Range rects -> highlight rects
  layer.tsx       overlay rendering positioned pin dots + highlight rects
  lifecycle.ts    observer wiring (scroll / resize / ResizeObserver / MutationObserver / route)
```

`marker/stub-anchor.ts` (+ its test) is **deleted**. `marker/MarkerLayer.tsx` is
reworked into the place-mode trigger plus the host for the positioning layer and the
runtime orchestrator.

Each unit has one purpose and a narrow interface: `selectors`/`capture`/`rematch`/
`coords` are **pure and headless-testable** (jsdom + mocked rects); `lifecycle` and
`layer` are the only DOM-effectful, observer-driven units; `runtime` is the
orchestrator that ties them together and owns all I/O (the API client).

### `RematchResult`

```ts
type RematchResult =
  | { kind: 'anchored';      el: Element; range?: Range; healed?: Anchor }
  | { kind: 'selectionLost'; el: Element }            // element found, quote not
  | { kind: 'orphaned';      reason: 'noCandidates' | 'belowAccept' | 'ambiguous' }
```

## Capture (unified place mode)

**Element.** `target = document.elementFromPoint(x, y)`.
- `selectors = buildSelectors(target)` → `[structuralSelector, classSelector]`
  (structural = nth-of-type ancestor path; class = class-path), matching §7.
- `signals = extractSignals(target)` (reused from M2b).
- `offset = { fx: clamp01((x − rect.left) / rect.width), fy: clamp01((y − rect.top) / rect.height) }`.
- `captureContext` (viewport, DPR, UA) via the existing `buildCaptureContext()`.

**Selection.** The range's **common-ancestor element** becomes the top-level anchor,
so that a later lost quote still leaves a usable element pin:
- top-level `selectors`/`signals` describe `range.commonAncestorContainer`'s element;
  `offset` defaults to the start-rect position within that element.
- `selection = { start, end, quote, prefix, suffix }`, where `start`/`end` are each
  `{ selectors, textNodeIndex, offset }` for the endpoint's containing element and
  text node, `quote` = the selected text, and `prefix`/`suffix` = ±32 chars around
  the quote (for disambiguation by `locateQuote`).

Both paths produce a schema-valid `Anchor` (`schemaVersion = ANCHOR_SCHEMA_VERSION`)
that replaces `makeStubAnchor()` in the create-thread call. Thread creation still
posts **placeholder comment text** — the composer is M7.

## Re-match pipeline (`rematch`, per §7)

1. **Fast path.** `resolveSelector(structural)` then `(class)`; a single hit whose
   re-extracted signals agree (tag match + any stored `stableAttrs` match) →
   `anchored`, no scoring.
2. **Scored search.** Scope candidates to the nearest *surviving* ancestor-landmark:
   walk the stored `signals.ancestorTrail`, take the first label that still resolves;
   else fall back to the whole document. Collect descendants of the stored `tag`, and
   `scoreCandidate(extractSignals(candidate), storedSignals)` each.
3. **Decide.** `decide(scored, DEFAULT_THRESHOLDS)` → `anchored(winner)` or
   `orphaned(noCandidates | belowAccept | ambiguous)`.
4. **Self-heal.** When re-match succeeds via *scoring* (i.e. the fingerprint drifted,
   not a clean fast-path identity), capture a fresh fingerprint from the winner and
   report it via `refreshAnchor` (see the contract note below). Fire-and-forget: a
   failed call keeps the old anchor and simply retries on the next load.
5. **Selection.** After the element anchors, run `locateQuote({ quote, prefix, suffix })`
   over the winner's text to build a `Range` for the highlight. A miss → keep the
   element pin and return `selectionLost` (not orphaned).

## Positioning engine + lifecycle

**Coordinates (`coords.ts`, pure).**
- Pin = `targetRect.left + fx * w`, `targetRect.top + fy * h`, plus scroll offset,
  expressed in the overlay's coordinate space.
- Highlight = `range.getClientRects()` mapped into the same overlay space.

**Overlay (`layer.tsx`).** The existing absolutely-positioned `data-comments-overlay`
(`position: absolute; inset: 0; pointer-events: none`) hosts the pin dots and
highlight rects. Renders nothing for orphaned threads (see below).

**Lifecycle (`lifecycle.ts`).** Recompute positions on:
- window `scroll` and `resize` — coalesced via `requestAnimationFrame`;
- a `ResizeObserver` per anchored target element;
- a **throttled** `MutationObserver` on `document.body` — mutations trigger a
  re-match pass *and* a reposition (the DOM may have changed under anchored pins).

**SPA route change.** Patch `history.pushState`/`replaceState` and listen for
`popstate`. On a URL change, recompute `pageKey`. **If `pageKey` changed this is a
full re-key, not a reposition:** tear down the current pins, re-list threads for the
new `pageKey`, and re-match from scratch. (A URL change that does *not* change
`pageKey` is just a reposition.)

## Orphan / selectionLost / self-heal semantics

**One endpoint reports every re-match outcome.** The contract has a single
`refreshAnchor` operation (`PATCH /threads/:id/anchor`, body `RefreshAnchorBody =
{ anchorState: 'anchored' | 'orphaned', selectors?, signals?, selectionLost? }`).
There is **no** separate `report-orphan` endpoint. The re-match pass maps to it as:

| Outcome             | `refreshAnchor` body                                                   |
| ------------------- | --------------------------------------------------------------------- |
| Healed (drifted)    | `{ anchorState: 'anchored', selectors, signals }` (fresh fingerprint)  |
| Clean fast-path hit | no call (nothing changed)                                              |
| Orphaned            | `{ anchorState: 'orphaned' }`                                          |
| selectionLost       | `{ anchorState: 'anchored', selectionLost: true }`                     |

- **Orphan = data-layer, not visual.** An orphaned thread has no position to draw and
  the cross-page panel is M8, so M6 reports it via `refreshAnchor` and drops the
  thread from the overlay. It does **not** render an orphan marker on the page.
- **selectionLost is persisted.** The element pin stays rendered with no highlight,
  and `refreshAnchor({ selectionLost: true })` records it server-side (so M8/M7 can
  surface "needs review" later). The element anchor remains `anchored`.
- `refreshAnchor` is the only write the re-match pass makes; all calls are
  fire-and-forget and idempotent on the next load.

## Testing strategy (architecture §9)

- **Capture + re-match — jsdom unit tests.** Extend M2b's anchoring fixture corpus
  (original-DOM → mutated-DOM pairs) to assert the runtime outcome — *anchored-to-X /
  orphaned / selectionLost* — across every mutation class: wrapper-added, reorder,
  class rename, text change, attribute change, element removed, duplicate siblings.
  This is the linchpin (§9) that makes "re-anchors reliably across builds" measurable.
- **Positioning — unit tests with mocked rects/observers.** Mock
  `getBoundingClientRect` / `getClientRects` and `ResizeObserver` / `MutationObserver`
  to assert (a) the `coords.ts` math and (b) that each observer callback triggers a
  recompute. (§9: "positioning tests with mocked rects/observers.")
- **Out of M6:** the live, real-layout reload + DOM-mutation → re-anchor/orphan loop
  in a browser is **M9 Playwright** against the `examples/` host app.

## Build sequence (vertical slice; TDD for the pure units)

The slice is element-pin end-to-end first, then text-selection layered on top — the
two paths share the same anchor structure and pipeline, so this orders by risk
without splitting the milestone.

1. **Selectors** — `buildSelectors` / `resolveSelector` (jsdom).
2. **Element capture** — `captureElement` producing a schema-valid `Anchor` (jsdom).
3. **Element re-match** — fast path → scoped scored search → `decide` → self-heal,
   validated against the fixture corpus.
4. **Positioning + lifecycle** for element pins — `coords` math + observer wiring,
   mocked rects/observers.
5. **Place-mode trigger** wired into `MarkerLayer`; `stub-anchor` deleted; **element
   pin works end-to-end** against the live API.
6. **Text selection** layered on: `captureSelection`, endpoint resolution,
   `locateQuote` highlight, and the `selectionLost` path.
7. **Re-match reporting** via `refreshAnchor` (orphaned + selectionLost cases) and
   **SPA route re-key**.

## Exit criteria (from milestones.md M6)

- Place an element pin **and** a text selection → reload → both re-anchor.
- Mutate the DOM (reorder / rename / wrap) → re-anchors per the fixture-corpus
  expectations.
- Unfindable element → orphaned (reported, dropped from overlay).
- Lost quote → element pin retained, `selectionLost`.
- Pins track scroll / resize / route changes.

## Out of scope

Thread/composer/popover visual UI (M7); the cross-page panel and any orphan listing
UI (M8); the live browser e2e loop (M9); changes to the frozen `Anchor`/`Signals`/
`Selection` schemas, the scoring weights, or the thresholds (M2a/M2b).
