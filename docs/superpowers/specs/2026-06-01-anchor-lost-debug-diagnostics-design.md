# Anchor-lost debug diagnostics — design

**Date:** 2026-06-01
**Status:** accepted

## Problem

When a comment thread orphans (the "anchor lost" tag in `PanelRow.tsx`), there is
no way to learn *why*. The rematch pipeline already knows the reason
(`noCandidates` | `belowAccept` | `ambiguous`) and the candidate scores that led
to it, but that information is discarded:

- `decide()` (core) returns the reason but not the losing candidates' scores.
- `rematch()` (client) returns only `{ kind: 'orphaned', reason }`.
- `runtime.matchAndReport()` drops even the reason — it calls
  `refreshAnchor(item.id, { anchorState: 'orphaned' })` and returns `null`.

We want a developer, with the browser console open, to see exactly why a given
thread lost its anchor.

## Decisions

- **Client-only.** No changes to `core` schemas, `server`, or the persistence
  adapters. The diagnostic is computed and logged in the browser at rematch time.
- **Always `console.debug`.** Browsers hide `console.debug` under the *Verbose*
  log level by default, so it is silent for normal users and available to anyone
  who opts into verbose. No config flag, no new API surface.

## Approach

Keep `rematch()` pure (returns data, no I/O) and emit the log from `runtime`,
which is already the side-effecting layer (it performs `refreshAnchor`). This
keeps the "what were the scores / why orphaned" logic assertable in unit tests
without spying on `console`.

### 1. `packages/client/src/anchor/rematch.ts`

Extend the orphaned result variant to carry diagnostics built from the `scored`
array already computed in the scored-search path:

```ts
export type OrphanDiagnostics = {
  candidateCount: number
  thresholds: { accept: number; margin: number }   // DEFAULT_THRESHOLDS
  stored: { tag: string; selectors: readonly string[] }
  // Top candidates by score, highest first (capped at 3). Empty when noCandidates.
  top: Array<{ total: number; components: ScoreComponents; excluded: false | 'tagMismatch' }>
}

export type RematchResult =
  | { kind: 'anchored'; el: Element; range?: Range; healed?: Healed }
  | { kind: 'selectionLost'; el: Element; healed?: Healed }
  | { kind: 'orphaned'; reason: 'noCandidates' | 'belowAccept' | 'ambiguous'; diagnostics: OrphanDiagnostics }
```

- Import `DEFAULT_THRESHOLDS` and the `ScoreComponents` type from `@comments/core`.
- When `decide()` returns `orphaned`, sort `scored` by `score.total` descending,
  take the top 3, and assemble `OrphanDiagnostics`.
- `noCandidates` → `candidateCount: 0`, `top: []`.
- `stored.tag` / `stored.selectors` come from the `anchor` argument
  (`anchor.signals.tag`, `anchor.selectors`).

### 2. `packages/client/src/anchor/runtime.ts`

In `matchAndReport`, on the orphaned branch, log before reporting:

```ts
if (res.kind === 'orphaned') {
  console.debug('[comments] anchor lost', {
    threadId: item.id,
    pageKey: opts.pageKey,
    reason: res.reason,
    ...res.diagnostics,
  })
  void opts.client.refreshAnchor(item.id, { anchorState: 'orphaned' }).catch(() => {})
  return null
}
```

No other behavior changes — the `refreshAnchor` call and `return null` are
unchanged.

## What it reveals

- **belowAccept** — best `total` vs the `0.6` accept line, plus the per-component
  breakdown showing which signals were weak.
- **ambiguous** — the top-two `total`s, both within the `0.1` margin.
- **noCandidates** — zero elements of the stored tag survived under the ancestor
  scope (`candidateCount: 0`).

## Testing

Client tests (vitest; architecture §9, not strict TDD):

- `rematch.test.ts` — for each orphan reason, assert the result now includes
  `diagnostics` with the expected `candidateCount`, `thresholds`, and `top`
  scores (e.g. `belowAccept` has a non-empty `top` whose best `total < 0.6`;
  `noCandidates` has `candidateCount: 0` and `top: []`).
- `runtime.test.ts` — spy on `console.debug`; assert it fires exactly once on an
  orphan with `threadId` / `reason` / `candidateCount`, and does **not** fire on
  a successful match.

## Out of scope

- No persistence of the reason; no panel/"anchor lost" tag UI change.
- No config/debug flag.
- No changes to `core`, `server`, or adapters.

## Consequences

- `RematchResult`'s orphaned variant gains a required `diagnostics` field — any
  other consumer constructing or matching that variant must be updated (currently
  only `runtime.ts` and the rematch tests).
- The anchor-corpus runner (`packages/client/test/anchor-corpus/runner.ts`) maps
  rematch decisions to a reduced shape; it ignores extra fields, so it is
  unaffected. Confirm during implementation.
