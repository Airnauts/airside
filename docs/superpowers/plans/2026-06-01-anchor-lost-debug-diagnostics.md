# Anchor-lost Debug Diagnostics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a comment thread orphans during rematch, emit a rich `console.debug` explaining why (reason, candidate count, thresholds, top candidate scores) — silent for normal users, visible at the browser console's Verbose level.

**Architecture:** Keep `rematch()` pure by extending its orphaned result with a `diagnostics` payload built from the scores it already computes; emit the `console.debug` from `runtime.matchAndReport()`, which is already the side-effecting layer (it performs `refreshAnchor`). No changes to `core`, `server`, or persistence adapters.

**Tech Stack:** TypeScript, Vitest (jsdom), `@comments/core` (`ScoreComponents`, `DEFAULT_THRESHOLDS`).

Spec: `docs/superpowers/specs/2026-06-01-anchor-lost-debug-diagnostics-design.md`

---

## File Structure

- **Modify** `packages/client/src/anchor/rematch.ts` — add `OrphanDiagnostics` type; add `diagnostics` to the orphaned `RematchResult` variant; build it from the `scored` array.
- **Modify** `packages/client/src/anchor/rematch.test.ts` — assert diagnostics on an orphaned result (one belowAccept-style case + one noCandidates case).
- **Modify** `packages/client/src/anchor/runtime.ts` — `console.debug` on the orphan branch of `matchAndReport`.
- **Modify** `packages/client/src/anchor/runtime.test.ts` — assert `console.debug` fires on orphan, not on a successful match.

No new files. The corpus runner (`packages/client/test/anchor-corpus/runner.ts`) uses `decide()` directly and imports only `findCandidates` from `rematch.ts`, so it is unaffected.

---

## Task 1: Add OrphanDiagnostics to rematch (test-first)

**Files:**
- Modify: `packages/client/src/anchor/rematch.ts`
- Test: `packages/client/src/anchor/rematch.test.ts`

- [ ] **Step 1: Write the failing tests**

Add these two tests to `packages/client/src/anchor/rematch.test.ts`, inside the existing `describe('rematch fast path', ...)` block (after the current `'orphans when nothing clears the threshold'` test at line 58). They reuse the file's existing `parse` and `anchorFor` helpers.

```ts
  it('orphan carries diagnostics: top scores below the accept threshold', () => {
    // Same tag (p) survives so there IS a candidate, but text/classes differ enough
    // that the best total falls under accept (0.6) -> belowAccept with a non-empty top.
    const before = parse('<main><p id="t" class="lead">unique snippet here alpha beta</p></main>')
    const anchor = anchorFor(before, '#t')
    const after = parse('<main><p class="other">completely unrelated wording entirely</p></main>')
    const res = rematch(anchor, after)
    expect(res.kind).toBe('orphaned')
    if (res.kind === 'orphaned') {
      expect(res.reason).toBe('belowAccept')
      expect(res.diagnostics.thresholds).toEqual({ accept: 0.6, margin: 0.1 })
      expect(res.diagnostics.candidateCount).toBe(1)
      expect(res.diagnostics.stored.tag).toBe('p')
      expect(res.diagnostics.top.length).toBeGreaterThan(0)
      expect(res.diagnostics.top[0].total).toBeLessThan(0.6)
      // components are present so the weak signals are visible
      expect(res.diagnostics.top[0].components).toHaveProperty('text')
    }
  })

  it('orphan carries diagnostics: no candidates of the stored tag', () => {
    const before = parse('<main><p id="t" class="lead">unique snippet here</p></main>')
    const anchor = anchorFor(before, '#t')
    const after = parse('<main><span>totally different</span></main>')
    const res = rematch(anchor, after)
    expect(res.kind).toBe('orphaned')
    if (res.kind === 'orphaned') {
      expect(res.reason).toBe('noCandidates')
      expect(res.diagnostics.candidateCount).toBe(0)
      expect(res.diagnostics.top).toEqual([])
    }
  })
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @comments/client test -- rematch.test.ts`
Expected: FAIL — `res.diagnostics` is `undefined` / property does not exist on the orphaned type (TS error and/or runtime assertion failure on `thresholds`).

- [ ] **Step 3: Implement the diagnostics**

In `packages/client/src/anchor/rematch.ts`:

(a) Update the imports at the top of the file. The current line is:

```ts
import { decide, locateQuote, scoreCandidate } from '@comments/core'
```

Replace it with:

```ts
import {
  DEFAULT_THRESHOLDS,
  decide,
  locateQuote,
  type ScoreComponents,
  scoreCandidate,
} from '@comments/core'
```

(b) Add the `OrphanDiagnostics` type and extend the orphaned variant. The current block is:

```ts
export type Healed = { selectors: [string, string]; signals: Signals }
export type RematchResult =
  | { kind: 'anchored'; el: Element; range?: Range; healed?: Healed }
  | { kind: 'selectionLost'; el: Element; healed?: Healed }
  | { kind: 'orphaned'; reason: 'noCandidates' | 'belowAccept' | 'ambiguous' }
```

Replace it with:

```ts
export type Healed = { selectors: [string, string]; signals: Signals }

/** Why an anchor was lost, with the scores that led there — for console diagnostics. */
export type OrphanDiagnostics = {
  candidateCount: number
  thresholds: { accept: number; margin: number }
  stored: { tag: string; selectors: readonly string[] }
  // Top candidates by score, highest first (capped at 3). Empty when noCandidates.
  top: Array<{ total: number; components: ScoreComponents; excluded: false | 'tagMismatch' }>
}

export type RematchResult =
  | { kind: 'anchored'; el: Element; range?: Range; healed?: Healed }
  | { kind: 'selectionLost'; el: Element; healed?: Healed }
  | {
      kind: 'orphaned'
      reason: 'noCandidates' | 'belowAccept' | 'ambiguous'
      diagnostics: OrphanDiagnostics
    }
```

(c) Build and return the diagnostics in the orphaned branch of `rematch()`. The current lines (inside `rematch`, after `const decision = decide(scored)`) are:

```ts
  const decision = decide(scored)
  if (decision.kind === 'orphaned') return { kind: 'orphaned', reason: decision.reason }
```

Replace with:

```ts
  const decision = decide(scored)
  if (decision.kind === 'orphaned') {
    const top = [...scored]
      .sort((a, b) => b.score.total - a.score.total)
      .slice(0, 3)
      .map((s) => ({
        total: s.score.total,
        components: s.score.components,
        excluded: s.score.excluded,
      }))
    return {
      kind: 'orphaned',
      reason: decision.reason,
      diagnostics: {
        candidateCount: scored.length,
        thresholds: { accept: DEFAULT_THRESHOLDS.accept, margin: DEFAULT_THRESHOLDS.margin },
        stored: { tag: anchor.signals.tag, selectors: anchor.selectors },
        top,
      },
    }
  }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @comments/client test -- rematch.test.ts`
Expected: PASS — all rematch tests, including the two new ones.

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/anchor/rematch.ts packages/client/src/anchor/rematch.test.ts
git commit -m "feat(client): carry orphan diagnostics out of rematch"
```

---

## Task 2: Log diagnostics from the runtime (test-first)

**Files:**
- Modify: `packages/client/src/anchor/runtime.ts:35-39` (the orphan branch of `matchAndReport`)
- Test: `packages/client/src/anchor/runtime.test.ts`

- [ ] **Step 1: Write the failing tests**

Add these two tests to `packages/client/src/anchor/runtime.test.ts`, inside the existing `describe('createRuntime.refresh', ...)` block (after the orphan test that ends at line 69). They reuse the file's existing `anchorFor`, `li`, and `fakeClient` helpers. `vi` is already imported at line 2.

```ts
  it('console.debug explains why a thread orphaned', async () => {
    document.body.innerHTML = '<main><span>nothing matches</span></main>'
    const orphanAnchor: Anchor = {
      schemaVersion: ANCHOR_SCHEMA_VERSION,
      selectors: ['#gone', '#gone'],
      signals: {
        tag: 'p',
        classes: ['lead'],
        siblingIndex: 0,
        ancestorTrail: ['main'],
        textSnippet: 'unique gone text',
      },
      offset: { fx: 0.5, fy: 0.5 },
    } as unknown as Anchor
    const debug = vi.spyOn(console, 'debug').mockImplementation(() => {})
    const client = fakeClient([li('thd', orphanAnchor)])
    const rt = createRuntime({ client: client as never, pageKey: 'k', onPlacements: vi.fn() })
    await rt.refresh()
    expect(debug).toHaveBeenCalledTimes(1)
    expect(debug).toHaveBeenCalledWith(
      '[comments] anchor lost',
      expect.objectContaining({
        threadId: 'thd',
        pageKey: 'k',
        reason: 'noCandidates',
        candidateCount: 0,
      }),
    )
    debug.mockRestore()
  })

  it('does not console.debug when a thread anchors successfully', async () => {
    document.body.innerHTML = '<main><p id="ok" class="lead">hello world</p></main>'
    mockRect(document.querySelector('#ok') as Element, { left: 0, top: 0, width: 100, height: 20 })
    const debug = vi.spyOn(console, 'debug').mockImplementation(() => {})
    const client = fakeClient([li('tha', anchorFor('#ok'))])
    const rt = createRuntime({ client: client as never, pageKey: 'k', onPlacements: vi.fn() })
    await rt.refresh()
    expect(debug).not.toHaveBeenCalled()
    debug.mockRestore()
  })
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @comments/client test -- runtime.test.ts`
Expected: FAIL — the first new test fails because `console.debug` is never called (0 calls, expected 1).

- [ ] **Step 3: Add the console.debug**

In `packages/client/src/anchor/runtime.ts`, the current orphan branch in `matchAndReport` is:

```ts
    const res = rematch(anchor, root)
    if (res.kind === 'orphaned') {
      void opts.client.refreshAnchor(item.id, { anchorState: 'orphaned' }).catch(() => {})
      return null
    }
```

Replace it with:

```ts
    const res = rematch(anchor, root)
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

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @comments/client test -- runtime.test.ts`
Expected: PASS — all runtime tests, including the two new ones. The pre-existing orphan tests (lines 49–69 and 144–162) still pass because the `refreshAnchor` call is unchanged.

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/anchor/runtime.ts packages/client/src/anchor/runtime.test.ts
git commit -m "feat(client): console.debug why an anchor was lost"
```

---

## Task 3: Full-suite verification

**Files:** none (verification only)

- [ ] **Step 1: Run the client package tests**

Run: `pnpm --filter @comments/client test`
Expected: PASS — no regressions across rematch, runtime, and the anchor corpus.

- [ ] **Step 2: Typecheck and lint the client package**

Run: `pnpm --filter @comments/client typecheck && pnpm lint`
Expected: PASS — `RematchResult`'s new required `diagnostics` field has only one consumer (`runtime.ts`), which is updated; no other typecheck or biome failures.

> If `pnpm --filter @comments/client typecheck` is not a defined script, run the repo-wide `pnpm typecheck` (or `pnpm build`) instead and confirm it passes.

- [ ] **Step 3: Commit (only if Step 2 required a lint autofix)**

```bash
git add -A
git commit -m "chore(client): lint fixups for orphan diagnostics"
```

---

## Self-Review notes

- **Spec coverage:** rematch diagnostics type + build (Task 1) ✓; runtime `console.debug` (Task 2) ✓; tests for each reason + the no-log-on-success case (Tasks 1–2) ✓; out-of-scope items (no persistence, no UI, no flag) are simply not present ✓.
- **Type consistency:** `OrphanDiagnostics` shape is identical between rematch.ts and the test assertions; `diagnostics.top[].excluded` matches `ScoreResult.excluded` (`false | 'tagMismatch'`); `thresholds` is `{ accept, margin }` everywhere.
- **No placeholders:** every code step shows the exact before/after and the run command + expected result.
