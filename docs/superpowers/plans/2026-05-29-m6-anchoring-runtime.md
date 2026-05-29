# M6 — Anchoring Runtime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Capture real DOM anchors (element + text selection), re-find them after reload/mutation via the M2b scoring policy, position pins/highlights with live observers, and report each re-match outcome (heal / orphan / selectionLost) through the single `refreshAnchor` endpoint.

**Architecture:** All new code lands in `@comments/client`. Pure, headless-testable units (`selectors`, `capture`, `rematch`, `positioning/coords`) carry the logic; `positioning/layer` + `positioning/lifecycle` are the only observer/DOM-effectful units; `anchor/runtime` orchestrates list → rematch → position → `refreshAnchor` and owns all I/O. The M2b corpus runner's `findCandidates` is **promoted** into `src/anchor/rematch.ts` and the corpus is re-pointed at it, so the fixture corpus regression-guards the production matcher.

**Tech Stack:** TypeScript 5.7 (ESM, `verbatimModuleSyntax`), Zod 4, React 19, Vitest (jsdom env for client), `@testing-library/react`, Biome. No new runtime or dev dependencies.

---

## Reference: frozen surfaces this plan consumes (do not modify)

From `@comments/core` (M2a/M2b):

```ts
// schemas/anchor
const ANCHOR_SCHEMA_VERSION = 1
type Signals = { tag: string; role?: string; textSnippet?: string; classes: string[]
                 siblingIndex: number; ancestorTrail: string[]; stableAttrs?: Record<string,string> }
type Selection = { start: SelectionEndpoint; end: SelectionEndpoint; quote: string; prefix: string; suffix: string }
type SelectionEndpoint = { selectors: [string,string]; textNodeIndex: number; offset: number }
type Anchor = { schemaVersion: number; selectors: [string,string]; signals: Signals
                offset: { fx: number; fy: number }; selection?: Selection }
// anchor/*
function scoreCandidate(stored: Signals, candidate: Signals): ScoreResult   // { total, components, excluded: false|'tagMismatch' }
function decide<T>(scored: Array<{ref:T; score:ScoreResult}>, opts?): Decision<T>
//   Decision = { kind:'anchored'; winner:T; score } | { kind:'orphaned'; reason:'noCandidates'|'belowAccept'|'ambiguous' }
function locateQuote(haystack: string, ctx: { quote:string; prefix:string; suffix:string }): { start:number; end:number } | null
```

From `@comments/client` (M2b/M5):

```ts
// src/anchor/extract.ts
function extractSignals(el: Element): Signals
// src/config.ts
function buildCaptureContext(win?: Window): CaptureContext
// src/api/client.ts  (ApiClient)
createThread(body: CreateThreadBody): Promise<Thread>
listThreads(params?: { pageKey?: string }): Promise<ThreadListResponse>   // { threads: ThreadListItem[], ... }
refreshAnchor(id: string, body: RefreshAnchorBody): Promise<ThreadListItem>
// RefreshAnchorBody = { anchorState: 'anchored'|'orphaned'; selectors?: [string,string]; signals?: Signals; selectionLost?: boolean }
// ThreadListItem includes: { id, anchor: Anchor, anchorState, selectionLost?, ... }
```

## Authoritative new types (keep byte-identical wherever they reappear)

```ts
// src/anchor/rematch.ts
export type Healed = { selectors: [string, string]; signals: Signals }
export type RematchResult =
  | { kind: 'anchored';      el: Element; range?: Range; healed?: Healed }
  | { kind: 'selectionLost'; el: Element; healed?: Healed }
  | { kind: 'orphaned';      reason: 'noCandidates' | 'belowAccept' | 'ambiguous' }
```

## File structure

| File | Responsibility |
| --- | --- |
| `packages/client/src/anchor/selectors.ts` | `buildSelectors(el)` → `[structural, class]`; `resolveUnique(sel, root)` → single-hit Element\|null |
| `packages/client/src/anchor/capture.ts` | `clamp01`, `offsetWithin`, `captureElement(el, point)`, `captureSelection(range)` → `Anchor` |
| `packages/client/src/anchor/rematch.ts` | `findCandidates` (promoted), `signalsAgree`, `rematch(anchor, root)` → `RematchResult` |
| `packages/client/src/positioning/coords.ts` | pure: `pinXY(rect, offset, scroll)`, `mapRects(rects, origin)` |
| `packages/client/src/positioning/layer.tsx` | overlay rendering positioned pin dots + highlight rects |
| `packages/client/src/positioning/lifecycle.ts` | `observeReposition(opts)` — scroll/resize/ResizeObserver/MutationObserver/route wiring |
| `packages/client/src/anchor/runtime.ts` | `createRuntime(...)`: list → rematch → position → `refreshAnchor` |
| `packages/client/src/marker/MarkerLayer.tsx` | reworked: place-mode toggle, ESC, capture dispatch (host for runtime + layer) |
| `packages/client/test/test-helpers/dom.ts` | test-only: `mockRect`, `makeObserverSpy` |

Deletions: `packages/client/src/marker/stub-anchor.ts`, `packages/client/src/marker/stub-anchor.test.ts`.
Re-point (no behavior change): `packages/client/test/anchor-corpus/runner.ts` imports `findCandidates` from `../../src/anchor/rematch`.

---

## Task 0: Baseline — corpus + client suite green before any change

**Files:** none (verification only).

- [ ] **Step 1: Run the full client suite and confirm green**

Run: `pnpm --filter @comments/client test`
Expected: PASS (all existing M2b corpus + M5 tests green). This is the baseline the promotion (Task 4) must preserve. If anything is red here, stop and report — do not start M6 on a red baseline.

---

## Task 1: Selectors — `buildSelectors` + `resolveUnique`

**Files:**
- Create: `packages/client/src/anchor/selectors.ts`
- Test: `packages/client/src/anchor/selectors.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// packages/client/src/anchor/selectors.test.ts
import { describe, expect, it } from 'vitest'
import { buildSelectors, resolveUnique } from './selectors'

const body = (html: string): HTMLElement => {
  document.body.innerHTML = html
  return document.body
}

describe('buildSelectors', () => {
  it('prefers #id for the class selector and an nth-of-type structural path', () => {
    const root = body('<main><section><p class="lead intro" id="x">hi</p></section></main>')
    const el = root.querySelector('#x') as Element
    const [structural, klass] = buildSelectors(el)
    expect(klass).toBe('#x')
    // structural is an ancestor nth-of-type path that resolves back to el
    expect(root.querySelector(structural)).toBe(el)
  })

  it('falls back to class-path when no id/data-testid', () => {
    const root = body('<div><p class="lead intro">hi</p></div>')
    const el = root.querySelector('p') as Element
    const [, klass] = buildSelectors(el)
    expect(klass).toBe('p.lead.intro')
    expect(root.querySelector(klass)).toBe(el)
  })

  it('uses data-testid when present and no id', () => {
    const root = body('<div><button data-testid="save">S</button></div>')
    const el = root.querySelector('button') as Element
    const [, klass] = buildSelectors(el)
    expect(klass).toBe('[data-testid="save"]')
  })
})

describe('resolveUnique', () => {
  it('returns the element on a single match', () => {
    const root = body('<div><p id="only">x</p></div>')
    expect(resolveUnique('#only', root)).toBe(root.querySelector('#only'))
  })
  it('returns null on zero or multiple matches', () => {
    const root = body('<div><p class="dup">a</p><p class="dup">b</p></div>')
    expect(resolveUnique('.missing', root)).toBeNull()
    expect(resolveUnique('.dup', root)).toBeNull()
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @comments/client exec vitest run src/anchor/selectors.test.ts`
Expected: FAIL — `Cannot find module './selectors'`.

- [ ] **Step 3: Implement `selectors.ts`**

```ts
// packages/client/src/anchor/selectors.ts

/** Structural nth-of-type path from the nearest stable ancestor down to el. */
function structuralSelector(el: Element): string {
  const parts: string[] = []
  let cursor: Element | null = el
  const root = el.ownerDocument?.documentElement
  while (cursor && cursor !== root && cursor.parentElement) {
    const tag = cursor.tagName.toLowerCase()
    const parent = cursor.parentElement
    const sameTag = Array.from(parent.children).filter((c) => c.tagName === cursor?.tagName)
    const part = sameTag.length === 1 ? tag : `${tag}:nth-of-type(${sameTag.indexOf(cursor) + 1})`
    parts.unshift(part)
    // Stop climbing once anchored to an id'd ancestor — keeps the path short and robust.
    if (parent.id) {
      parts.unshift(`#${CSS.escape(parent.id)}`)
      return parts.join(' > ')
    }
    cursor = parent
  }
  return parts.join(' > ')
}

/** Stable, preferentially-unique selector: #id, then [data-testid], then tag.class.class. */
function classSelector(el: Element): string {
  if (el.id) return `#${CSS.escape(el.id)}`
  const testid = el.getAttribute('data-testid')
  if (testid) return `[data-testid="${CSS.escape(testid)}"]`
  const tag = el.tagName.toLowerCase()
  const classes = Array.from(el.classList).map((c) => `.${CSS.escape(c)}`)
  return `${tag}${classes.join('')}`
}

/** Dual selectors per architecture §7: [structural nth-of-type path, class path]. */
export function buildSelectors(el: Element): [string, string] {
  return [structuralSelector(el), classSelector(el)]
}

/** Resolve a selector to a single unique Element; null on zero or multiple hits. */
export function resolveUnique(selector: string, root: ParentNode): Element | null {
  let matches: NodeListOf<Element>
  try {
    matches = root.querySelectorAll(selector)
  } catch {
    return null // malformed selector (e.g. stale escaped value) → treat as miss
  }
  return matches.length === 1 ? matches[0] : null
}
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm --filter @comments/client exec vitest run src/anchor/selectors.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/anchor/selectors.ts packages/client/src/anchor/selectors.test.ts
git commit -m "M6: buildSelectors + resolveUnique (dual selector fingerprint)"
```

---

## Task 2: Element capture — `captureElement` (with NaN-offset guard)

**Files:**
- Create: `packages/client/src/anchor/capture.ts`
- Test: `packages/client/src/anchor/capture.test.ts`

Note the **production NaN guard**: `(x − rect.left) / rect.width` is `NaN` for a zero-width element, and `clamp01(NaN) === NaN` (NaN propagates through `Math.min`/`max`), which the `Anchor` schema's `offset: number().min(0).max(1)` rejects → `createThread` 400. Guard at the source.

- [ ] **Step 1: Write failing tests**

```ts
// packages/client/src/anchor/capture.test.ts
import { Anchor } from '@comments/core'
import { describe, expect, it } from 'vitest'
import { captureElement, clamp01, offsetWithin } from './capture'

const withRect = (el: Element, r: Partial<DOMRect>): Element => {
  el.getBoundingClientRect = () =>
    ({ x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, toJSON: () => ({}), ...r }) as DOMRect
  return el
}

describe('clamp01 / offsetWithin', () => {
  it('clamps into [0,1]', () => {
    expect(clamp01(-1)).toBe(0)
    expect(clamp01(2)).toBe(1)
    expect(clamp01(0.5)).toBe(0.5)
  })
  it('returns 0.5 for a zero-size extent instead of NaN', () => {
    expect(offsetWithin(0, { start: 0, size: 0 })).toBe(0.5)
    expect(Number.isNaN(offsetWithin(5, { start: 10, size: 0 }))).toBe(false)
  })
  it('computes fractional offset for a real extent', () => {
    expect(offsetWithin(30, { start: 10, size: 40 })).toBe(0.5)
  })
})

describe('captureElement', () => {
  it('produces a schema-valid Anchor with dual selectors, signals, and offset', () => {
    document.body.innerHTML = '<main><p id="t" class="lead">hello world</p></main>'
    const el = withRect(document.querySelector('#t') as Element, { left: 0, top: 0, width: 100, height: 20 })
    const anchor = captureElement(el, { x: 25, y: 10 })
    expect(() => Anchor.parse(anchor)).not.toThrow()
    expect(anchor.offset).toEqual({ fx: 0.25, fy: 0.5 })
    expect(anchor.selectors[1]).toBe('#t')
    expect(anchor.signals.tag).toBe('p')
  })

  it('never emits a NaN offset for a zero-size target', () => {
    document.body.innerHTML = '<div id="z"></div>'
    const el = withRect(document.querySelector('#z') as Element, { width: 0, height: 0 })
    const anchor = captureElement(el, { x: 0, y: 0 })
    expect(() => Anchor.parse(anchor)).not.toThrow()
    expect(anchor.offset).toEqual({ fx: 0.5, fy: 0.5 })
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @comments/client exec vitest run src/anchor/capture.test.ts`
Expected: FAIL — `Cannot find module './capture'`.

- [ ] **Step 3: Implement `capture.ts` (element path only; selection added in Task 8)**

```ts
// packages/client/src/anchor/capture.ts
import { ANCHOR_SCHEMA_VERSION, type Anchor } from '@comments/core'
import { extractSignals } from './extract'
import { buildSelectors } from './selectors'

export const clamp01 = (n: number): number => Math.max(0, Math.min(1, n))

/** Fractional offset of a coordinate within a 1-D extent; 0.5 when the extent is zero (NaN guard). */
export function offsetWithin(coord: number, extent: { start: number; size: number }): number {
  if (!(extent.size > 0)) return 0.5
  return clamp01((coord - extent.start) / extent.size)
}

export type Point = { x: number; y: number }

export function captureElement(el: Element, point: Point): Anchor {
  const rect = el.getBoundingClientRect()
  return {
    schemaVersion: ANCHOR_SCHEMA_VERSION,
    selectors: buildSelectors(el),
    signals: extractSignals(el),
    offset: {
      fx: offsetWithin(point.x, { start: rect.left, size: rect.width }),
      fy: offsetWithin(point.y, { start: rect.top, size: rect.height }),
    },
  }
}
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm --filter @comments/client exec vitest run src/anchor/capture.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/anchor/capture.ts packages/client/src/anchor/capture.test.ts
git commit -m "M6: captureElement + offset NaN guard (zero-size rect -> 0.5)"
```

---

## Task 3: Re-export capture/selectors from the anchor barrel

**Files:**
- Modify: `packages/client/src/anchor/index.ts` (currently `export { extractSignals } from './extract'`)
- Test: `packages/client/src/anchor/index.test.ts` (extend the existing file)

- [ ] **Step 1: Extend the barrel test**

```ts
// append to packages/client/src/anchor/index.test.ts
import { buildSelectors, captureElement, resolveUnique } from './index'
import { it as it2, expect as expect2 } from 'vitest'

it2('barrel re-exports the capture + selector surface', () => {
  expect2(typeof buildSelectors).toBe('function')
  expect2(typeof resolveUnique).toBe('function')
  expect2(typeof captureElement).toBe('function')
})
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @comments/client exec vitest run src/anchor/index.test.ts`
Expected: FAIL — exports undefined.

- [ ] **Step 3: Update the barrel**

```ts
// packages/client/src/anchor/index.ts
export { captureElement, clamp01, offsetWithin, type Point } from './capture'
export { extractSignals } from './extract'
export { buildSelectors, resolveUnique } from './selectors'
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm --filter @comments/client exec vitest run src/anchor/index.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/anchor/index.ts packages/client/src/anchor/index.test.ts
git commit -m "M6: re-export capture + selectors from anchor barrel"
```

---

## Task 4: Promote `findCandidates` into `rematch.ts` and re-point the corpus (regression gate)

This is the §9 linchpin: prove the promotion is behavior-preserving by keeping the corpus green with **zero fixture changes**. The runner comment invites exactly this swap.

**Files:**
- Create: `packages/client/src/anchor/rematch.ts`
- Modify: `packages/client/test/anchor-corpus/runner.ts` (delete its local `findCandidates` + ancestor helpers; import from src)
- Test: existing corpus (`packages/client/test/anchor-corpus/runner.test.ts`) is the gate.

- [ ] **Step 1: Create `rematch.ts` with the promoted scoped-search helpers**

Move `parseAncestorLabel`, `findAncestorMatch`, and `findCandidates` verbatim from `runner.ts` into the new module (these are the production scoping logic):

```ts
// packages/client/src/anchor/rematch.ts

/** Label format from extractSignals.ancestorLabel: 'tag', 'tag#id', or 'tag[data-testid=v]' (mutually exclusive). */
function parseAncestorLabel(label: string): { tag: string; id?: string; testid?: string } {
  const hash = label.indexOf('#')
  if (hash >= 0) return { tag: label.slice(0, hash), id: label.slice(hash + 1) }
  const bracket = label.indexOf('[data-testid=')
  if (bracket >= 0) {
    return { tag: label.slice(0, bracket), testid: label.slice(bracket + '[data-testid='.length, -1) }
  }
  return { tag: label }
}

function findAncestorMatch(root: ParentNode, label: string): Element | null {
  const parsed = parseAncestorLabel(label)
  const candidates = Array.from(root.querySelectorAll(parsed.tag))
  for (const el of candidates) {
    if (parsed.id && el.id === parsed.id) return el
    if (parsed.testid && el.getAttribute('data-testid') === parsed.testid) return el
    if (!parsed.id && !parsed.testid) return el
  }
  return null
}

/** Scope candidates to the nearest surviving ancestor-landmark; fall back to all of the stored tag. */
export function findCandidates(
  root: ParentNode,
  stored: { tag: string; ancestorTrail: string[] },
): Element[] {
  for (const label of stored.ancestorTrail) {
    const ancestor = findAncestorMatch(root, label)
    if (ancestor) return Array.from(ancestor.querySelectorAll(stored.tag))
  }
  return Array.from(root.querySelectorAll(stored.tag))
}
```

- [ ] **Step 2: Re-point the corpus runner at the promoted export**

In `packages/client/test/anchor-corpus/runner.ts`: delete the local `parseAncestorLabel`, `findAncestorMatch`, and `findCandidates` (and their explanatory comments), and add the import. Leave `cssSelectorFor`, `parseBody`, `runFixture`, and every fixture **untouched** — `cssSelectorFor` is a test-only winner-identity helper and fixtures' `expected.targetInAfter` is pinned to its form.

```ts
// near the top of packages/client/test/anchor-corpus/runner.ts
import { findCandidates } from '../../src/anchor/rematch'
```

- [ ] **Step 3: Run the corpus — must be green with zero fixture changes**

Run: `pnpm --filter @comments/client exec vitest run test/anchor-corpus`
Expected: PASS — identical results to Task 0. If any fixture flips, the move was not verbatim; diff against the original `runner.ts` and fix.

- [ ] **Step 4: Commit**

```bash
git add packages/client/src/anchor/rematch.ts packages/client/test/anchor-corpus/runner.ts
git commit -m "M6: promote findCandidates into src/anchor/rematch; re-point corpus (no behavior change)"
```

---

## Task 5: `rematch` — fast path + scored search → `RematchResult` (element-level)

The fast path is **not** corpus-covered (`runFixture` goes straight to scored search), so it gets dedicated tests here. Selection handling (`range` / `selectionLost`) is added in Task 8.

**Files:**
- Modify: `packages/client/src/anchor/rematch.ts`
- Test: `packages/client/src/anchor/rematch.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// packages/client/src/anchor/rematch.test.ts
import { ANCHOR_SCHEMA_VERSION, type Anchor } from '@comments/core'
import { describe, expect, it } from 'vitest'
import { extractSignals } from './extract'
import { buildSelectors } from './selectors'
import { rematch } from './rematch'

const parse = (html: string): HTMLElement =>
  new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html').body

function anchorFor(root: ParentNode, selector: string): Anchor {
  const el = root.querySelector(selector) as Element
  return {
    schemaVersion: ANCHOR_SCHEMA_VERSION,
    selectors: buildSelectors(el),
    signals: extractSignals(el),
    offset: { fx: 0.5, fy: 0.5 },
  }
}

describe('rematch fast path', () => {
  it('anchors via unique selector + agreeing signals, with no healed payload', () => {
    const before = parse('<main><p id="t" class="lead">hello</p></main>')
    const anchor = anchorFor(before, '#t')
    const after = parse('<main><p id="t" class="lead">hello</p></main>')
    const res = rematch(anchor, after)
    expect(res.kind).toBe('anchored')
    if (res.kind === 'anchored') {
      expect(res.el).toBe(after.querySelector('#t'))
      expect(res.healed).toBeUndefined()
    }
  })

  it('falls through to scored search when the selector is ambiguous, emitting healed', () => {
    const before = parse('<ul><li class="row">alpha beta gamma</li></ul>')
    const anchor = anchorFor(before, '.row')
    // after: class renamed (fast path misses) but text/structure still strongly match
    const after = parse('<ul><li class="row renamed">alpha beta gamma</li></ul>')
    const res = rematch(anchor, after)
    expect(res.kind).toBe('anchored')
    if (res.kind === 'anchored') {
      expect(res.el).toBe(after.querySelector('li'))
      expect(res.healed?.signals.tag).toBe('li')
    }
  })

  it('orphans when nothing clears the threshold', () => {
    const before = parse('<main><p id="t" class="lead">unique snippet here</p></main>')
    const anchor = anchorFor(before, '#t')
    const after = parse('<main><span>totally different</span></main>')
    const res = rematch(anchor, after)
    expect(res.kind).toBe('orphaned')
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @comments/client exec vitest run src/anchor/rematch.test.ts`
Expected: FAIL — `rematch` is not exported.

- [ ] **Step 3: Implement `rematch` (append to `rematch.ts`)**

```ts
// append to packages/client/src/anchor/rematch.ts
import type { Anchor, Signals } from '@comments/core'
import { decide, scoreCandidate } from '@comments/core'
import { extractSignals } from './extract'
import { buildSelectors, resolveUnique } from './selectors'

export type Healed = { selectors: [string, string]; signals: Signals }
export type RematchResult =
  | { kind: 'anchored'; el: Element; range?: Range; healed?: Healed }
  | { kind: 'selectionLost'; el: Element; healed?: Healed }
  | { kind: 'orphaned'; reason: 'noCandidates' | 'belowAccept' | 'ambiguous' }

/** Cheap agreement check for the fast path: same tag and every stored stableAttr present + equal. */
export function signalsAgree(stored: Signals, el: Element): boolean {
  if (stored.tag.toLowerCase() !== el.tagName.toLowerCase()) return false
  for (const [k, v] of Object.entries(stored.stableAttrs ?? {})) {
    const actual = k === 'id' ? el.id : el.getAttribute(k)
    if (actual !== v) return false
  }
  return true
}

function healedFrom(el: Element): Healed {
  return { selectors: buildSelectors(el), signals: extractSignals(el) }
}

export function rematch(anchor: Anchor, root: ParentNode): RematchResult {
  // 1. Fast path: a unique selector hit whose signals agree → anchored, no scoring, no heal.
  for (const selector of anchor.selectors) {
    const hit = resolveUnique(selector, root)
    if (hit && signalsAgree(anchor.signals, hit)) {
      return { kind: 'anchored', el: hit }
    }
  }
  // 2. Scored search scoped to the nearest surviving ancestor-landmark.
  const candidates = findCandidates(root, anchor.signals)
  const scored = candidates.map((el) => ({ ref: el, score: scoreCandidate(anchor.signals, extractSignals(el)) }))
  const decision = decide(scored)
  if (decision.kind === 'orphaned') return { kind: 'orphaned', reason: decision.reason }
  // 3. Matched via scoring → fingerprint drifted → emit a heal payload.
  return { kind: 'anchored', el: decision.winner, healed: healedFrom(decision.winner) }
}
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm --filter @comments/client exec vitest run src/anchor/rematch.test.ts`
Expected: PASS.

- [ ] **Step 5: Re-run the corpus to confirm no regression**

Run: `pnpm --filter @comments/client exec vitest run test/anchor-corpus`
Expected: PASS (unchanged).

- [ ] **Step 6: Commit**

```bash
git add packages/client/src/anchor/rematch.ts packages/client/src/anchor/rematch.test.ts
git commit -m "M6: rematch — fast path + scored search -> RematchResult"
```

---

## Task 6: Positioning math — `coords.ts` (pure)

**Files:**
- Create: `packages/client/src/positioning/coords.ts`
- Test: `packages/client/src/positioning/coords.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// packages/client/src/positioning/coords.test.ts
import { describe, expect, it } from 'vitest'
import { mapRects, pinXY } from './coords'

describe('pinXY', () => {
  it('places the pin at rect + fractional offset, document-relative', () => {
    const rect = { left: 100, top: 50, width: 200, height: 40 } as DOMRect
    expect(pinXY(rect, { fx: 0.5, fy: 0.25 }, { x: 0, y: 0 })).toEqual({ x: 200, y: 60 })
  })
  it('adds scroll offset to convert viewport coords to document coords', () => {
    const rect = { left: 10, top: 10, width: 100, height: 100 } as DOMRect
    expect(pinXY(rect, { fx: 0, fy: 0 }, { x: 5, y: 25 })).toEqual({ x: 15, y: 35 })
  })
})

describe('mapRects', () => {
  it('translates client rects into the overlay origin space', () => {
    const rects = [{ left: 30, top: 40, width: 10, height: 12 } as DOMRect]
    expect(mapRects(rects, { x: 5, y: 8 })).toEqual([{ x: 35, y: 48, width: 10, height: 12 }])
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @comments/client exec vitest run src/positioning/coords.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement `coords.ts`**

```ts
// packages/client/src/positioning/coords.ts
export type XY = { x: number; y: number }
export type Box = { x: number; y: number; width: number; height: number }

/** Pin position in document coords: rect corner + fractional offset + scroll. */
export function pinXY(rect: { left: number; top: number; width: number; height: number }, offset: { fx: number; fy: number }, scroll: XY): XY {
  return {
    x: rect.left + offset.fx * rect.width + scroll.x,
    y: rect.top + offset.fy * rect.height + scroll.y,
  }
}

/** Translate client rects into the overlay's coordinate space (origin = overlay's doc-space top-left). */
export function mapRects(rects: ReadonlyArray<{ left: number; top: number; width: number; height: number }>, origin: XY): Box[] {
  return rects.map((r) => ({ x: r.left + origin.x, y: r.top + origin.y, width: r.width, height: r.height }))
}
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm --filter @comments/client exec vitest run src/positioning/coords.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/positioning/coords.ts packages/client/src/positioning/coords.test.ts
git commit -m "M6: positioning coords (pinXY + mapRects), pure"
```

---

## Task 7: Test helpers — controllable observers + rect mocks

The global `test-setup.ts` stub for `ResizeObserver` is a no-op (for Radix). Positioning lifecycle tests need to *capture and fire* observer callbacks, so add a per-test helper.

**Files:**
- Create: `packages/client/test/test-helpers/dom.ts`
- Test: `packages/client/test/test-helpers/dom.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// packages/client/test/test-helpers/dom.test.ts
import { describe, expect, it } from 'vitest'
import { installObserverSpies, mockRect } from './dom'

describe('mockRect', () => {
  it('overrides getBoundingClientRect', () => {
    const el = document.createElement('div')
    mockRect(el, { left: 1, top: 2, width: 3, height: 4 })
    expect(el.getBoundingClientRect()).toMatchObject({ left: 1, top: 2, width: 3, height: 4 })
  })
})

describe('installObserverSpies', () => {
  it('captures ResizeObserver + MutationObserver callbacks and lets the test fire them', () => {
    const spies = installObserverSpies()
    try {
      let resized = 0
      const ro = new ResizeObserver(() => { resized++ })
      ro.observe(document.body)
      spies.fireResize()
      expect(resized).toBe(1)

      let mutated = 0
      const mo = new MutationObserver(() => { mutated++ })
      mo.observe(document.body, { childList: true })
      spies.fireMutation()
      expect(mutated).toBe(1)
    } finally {
      spies.restore()
    }
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @comments/client exec vitest run test/test-helpers/dom.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement `dom.ts`**

```ts
// packages/client/test/test-helpers/dom.ts
export function mockRect(el: Element, r: Partial<DOMRect>): void {
  el.getBoundingClientRect = () =>
    ({ x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, toJSON: () => ({}), ...r }) as DOMRect
}

type Spies = { fireResize: () => void; fireMutation: () => void; restore: () => void }

/** Replace global ResizeObserver/MutationObserver with versions whose callbacks the test can fire. */
export function installObserverSpies(): Spies {
  const resizeCbs: ResizeObserverCallback[] = []
  const mutationCbs: MutationCallback[] = []
  const g = globalThis as Record<string, unknown>
  const origRO = g.ResizeObserver
  const origMO = g.MutationObserver

  g.ResizeObserver = class {
    constructor(cb: ResizeObserverCallback) { resizeCbs.push(cb) }
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  g.MutationObserver = class {
    constructor(cb: MutationCallback) { mutationCbs.push(cb) }
    observe() {}
    disconnect() {}
    takeRecords() { return [] }
  }
  return {
    fireResize: () => { for (const cb of resizeCbs) cb([], {} as ResizeObserver) },
    fireMutation: () => { for (const cb of mutationCbs) cb([], {} as MutationObserver) },
    restore: () => { g.ResizeObserver = origRO; g.MutationObserver = origMO },
  }
}
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm --filter @comments/client exec vitest run test/test-helpers/dom.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/client/test/test-helpers/dom.ts packages/client/test/test-helpers/dom.test.ts
git commit -m "M6: test helpers — mockRect + controllable observer spies"
```

---

## Task 8: Positioning lifecycle — `observeReposition`

Wires scroll/resize/ResizeObserver/throttled-MutationObserver/route signals to a single `onReposition` callback, and a separate `onRouteChange` callback. Uses `requestAnimationFrame` coalescing.

**Files:**
- Create: `packages/client/src/positioning/lifecycle.ts`
- Test: `packages/client/src/positioning/lifecycle.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// packages/client/src/positioning/lifecycle.test.ts
import { afterEach, describe, expect, it, vi } from 'vitest'
import { installObserverSpies } from '../../test/test-helpers/dom'
import { observeReposition } from './lifecycle'

// rAF runs synchronously in these tests so coalesced callbacks fire deterministically.
beforeAll(() => {
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { cb(0); return 1 })
  vi.stubGlobal('cancelAnimationFrame', () => {})
})
afterEach(() => { vi.restoreAllMocks() })

describe('observeReposition', () => {
  it('calls onReposition on scroll and resize', () => {
    const spies = installObserverSpies()
    const onReposition = vi.fn()
    const stop = observeReposition({ targets: [], onReposition, onRouteChange: vi.fn() })
    window.dispatchEvent(new Event('scroll'))
    window.dispatchEvent(new Event('resize'))
    expect(onReposition).toHaveBeenCalledTimes(2)
    stop(); spies.restore()
  })

  it('calls onReposition when the MutationObserver fires', () => {
    const spies = installObserverSpies()
    const onReposition = vi.fn()
    const stop = observeReposition({ targets: [], onReposition, onRouteChange: vi.fn() })
    spies.fireMutation()
    expect(onReposition).toHaveBeenCalled()
    stop(); spies.restore()
  })

  it('calls onRouteChange on pushState and popstate', () => {
    const onRouteChange = vi.fn()
    const stop = observeReposition({ targets: [], onReposition: vi.fn(), onRouteChange })
    history.pushState({}, '', '/next')
    window.dispatchEvent(new PopStateEvent('popstate'))
    expect(onRouteChange).toHaveBeenCalledTimes(2)
    stop()
  })

  it('detaches all listeners on stop', () => {
    const onReposition = vi.fn()
    const stop = observeReposition({ targets: [], onReposition, onRouteChange: vi.fn() })
    stop()
    window.dispatchEvent(new Event('scroll'))
    expect(onReposition).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @comments/client exec vitest run src/positioning/lifecycle.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement `lifecycle.ts`**

```ts
// packages/client/src/positioning/lifecycle.ts
export type ObserveOptions = {
  targets: Element[]
  onReposition: () => void
  onRouteChange: () => void
}

/** Wire all reposition + route signals; returns a stop() that detaches everything. */
export function observeReposition(opts: ObserveOptions): () => void {
  let frame = 0
  const schedule = () => {
    if (frame) return
    frame = requestAnimationFrame(() => { frame = 0; opts.onReposition() })
  }

  window.addEventListener('scroll', schedule, { passive: true, capture: true })
  window.addEventListener('resize', schedule, { passive: true })

  const ro = new ResizeObserver(schedule)
  for (const t of opts.targets) ro.observe(t)

  const mo = new MutationObserver(schedule)
  mo.observe(document.body, { childList: true, subtree: true, attributes: true })

  const route = () => opts.onRouteChange()
  window.addEventListener('popstate', route)
  const origPush = history.pushState.bind(history)
  const origReplace = history.replaceState.bind(history)
  history.pushState = (...a: Parameters<History['pushState']>) => { origPush(...a); route() }
  history.replaceState = (...a: Parameters<History['replaceState']>) => { origReplace(...a); route() }

  return () => {
    if (frame) cancelAnimationFrame(frame)
    window.removeEventListener('scroll', schedule, { capture: true } as EventListenerOptions)
    window.removeEventListener('resize', schedule)
    ro.disconnect()
    mo.disconnect()
    window.removeEventListener('popstate', route)
    history.pushState = origPush
    history.replaceState = origReplace
  }
}
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm --filter @comments/client exec vitest run src/positioning/lifecycle.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/positioning/lifecycle.ts packages/client/src/positioning/lifecycle.test.ts
git commit -m "M6: observeReposition — scroll/resize/observers/route wiring"
```

---

## Task 9: Positioning layer — `<PinLayer/>`

Renders positioned pin dots and highlight rects from a list of placed anchors. Pure presentational component; positions are passed in (computed via `coords` by the runtime/host).

**Files:**
- Create: `packages/client/src/positioning/layer.tsx`
- Test: `packages/client/src/positioning/layer.test.tsx`

- [ ] **Step 1: Write failing tests**

```tsx
// packages/client/src/positioning/layer.test.tsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { PinLayer } from './layer'

describe('PinLayer', () => {
  it('renders a pin dot per placement at its document coords', () => {
    render(
      <PinLayer
        placements={[
          { id: 'a', pin: { x: 10, y: 20 }, highlight: [], pending: false },
          { id: 'b', pin: { x: 30, y: 40 }, highlight: [{ x: 1, y: 2, width: 5, height: 6 }], pending: true },
        ]}
      />,
    )
    const pins = screen.getAllByTestId('comments-pin')
    expect(pins).toHaveLength(2)
    expect(pins[0].style.transform).toContain('translate(10px, 20px)')
  })

  it('renders highlight rects for selection anchors', () => {
    render(<PinLayer placements={[{ id: 'a', pin: { x: 0, y: 0 }, highlight: [{ x: 1, y: 2, width: 5, height: 6 }], pending: false }]} />)
    expect(screen.getAllByTestId('comments-highlight')).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @comments/client exec vitest run src/positioning/layer.test.tsx`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement `layer.tsx`**

```tsx
// packages/client/src/positioning/layer.tsx
import type { Box, XY } from './coords'

export type Placement = { id: string; pin: XY; highlight: Box[]; pending: boolean }

export function PinLayer({ placements }: { placements: Placement[] }) {
  return (
    <div data-comments-overlay style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      {placements.flatMap((p) =>
        p.highlight.map((h, i) => (
          <div
            key={`${p.id}-hl-${i}`}
            data-testid="comments-highlight"
            data-comments-highlight
            style={{
              position: 'absolute',
              transform: `translate(${h.x}px, ${h.y}px)`,
              width: h.width,
              height: h.height,
              background: 'rgba(37,99,235,0.18)',
              pointerEvents: 'none',
            }}
          />
        )),
      )}
      {placements.map((p) => (
        <div
          key={p.id}
          data-testid="comments-pin"
          data-comments-pin
          style={{
            position: 'absolute',
            transform: `translate(${p.pin.x}px, ${p.pin.y}px)`,
            width: 20,
            height: 20,
            marginLeft: -10,
            marginTop: -10,
            borderRadius: '9999px',
            background: p.pending ? '#9ca3af' : '#2563eb',
            pointerEvents: 'auto',
          }}
        />
      ))}
    </div>
  )
}
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm --filter @comments/client exec vitest run src/positioning/layer.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/positioning/layer.tsx packages/client/src/positioning/layer.test.tsx
git commit -m "M6: PinLayer — positioned pin dots + highlight rects"
```

---

## Task 10: Runtime orchestrator — `createRuntime` (element path)

Ties it together for element pins: list threads for the pageKey, rematch each against `document`, compute placements via `coords`, and report outcomes via `refreshAnchor` (heal / orphan). Returns a controller the React host subscribes to. Selection (`range`/`selectionLost`) is layered in Task 12.

**Files:**
- Create: `packages/client/src/anchor/runtime.ts`
- Test: `packages/client/src/anchor/runtime.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// packages/client/src/anchor/runtime.test.ts
import { ANCHOR_SCHEMA_VERSION, type Anchor } from '@comments/core'
import { describe, expect, it, vi } from 'vitest'
import { mockRect } from '../../test/test-helpers/dom'
import { buildSelectors } from './selectors'
import { extractSignals } from './extract'
import { createRuntime } from './runtime'

const anchorFor = (sel: string): Anchor => {
  const el = document.querySelector(sel) as Element
  return { schemaVersion: ANCHOR_SCHEMA_VERSION, selectors: buildSelectors(el), signals: extractSignals(el), offset: { fx: 0.5, fy: 0.5 } }
}

function fakeClient(threads: Array<{ id: string; anchor: Anchor }>) {
  return {
    listThreads: vi.fn().mockResolvedValue({ threads, nextCursor: null }),
    refreshAnchor: vi.fn().mockResolvedValue({}),
  }
}

describe('createRuntime.refresh', () => {
  it('places anchored threads and emits placements', async () => {
    document.body.innerHTML = '<main><p id="t" class="lead">hello world</p></main>'
    mockRect(document.querySelector('#t') as Element, { left: 0, top: 0, width: 100, height: 20 })
    const client = fakeClient([{ id: 'th1', anchor: anchorFor('#t') }])
    const onPlacements = vi.fn()
    const rt = createRuntime({ client: client as never, pageKey: 'k', onPlacements })
    await rt.refresh()
    const last = onPlacements.mock.calls.at(-1)?.[0]
    expect(last).toHaveLength(1)
    expect(last[0].id).toBe('th1')
  })

  it('reports orphans via refreshAnchor and drops them from placements', async () => {
    document.body.innerHTML = '<main><span>nothing matches</span></main>'
    const orphanAnchor: Anchor = {
      schemaVersion: ANCHOR_SCHEMA_VERSION,
      selectors: ['#gone', '#gone'],
      signals: { tag: 'p', classes: ['lead'], siblingIndex: 0, ancestorTrail: ['main'], textSnippet: 'unique gone text' },
      offset: { fx: 0.5, fy: 0.5 },
    }
    const client = fakeClient([{ id: 'th2', anchor: orphanAnchor }])
    const onPlacements = vi.fn()
    const rt = createRuntime({ client: client as never, pageKey: 'k', onPlacements })
    await rt.refresh()
    expect(client.refreshAnchor).toHaveBeenCalledWith('th2', { anchorState: 'orphaned' })
    expect(onPlacements.mock.calls.at(-1)?.[0]).toHaveLength(0)
  })

  it('self-heals a drifted match via refreshAnchor(anchored, fresh fingerprint)', async () => {
    document.body.innerHTML = '<ul><li class="row renamed">alpha beta gamma delta</li></ul>'
    mockRect(document.querySelector('li') as Element, { left: 0, top: 0, width: 50, height: 10 })
    const stored: Anchor = {
      schemaVersion: ANCHOR_SCHEMA_VERSION,
      selectors: ['ul > li', 'li.row'],
      signals: { tag: 'li', classes: ['row'], siblingIndex: 0, ancestorTrail: ['ul'], textSnippet: 'alpha beta gamma delta' },
      offset: { fx: 0.5, fy: 0.5 },
    }
    const client = fakeClient([{ id: 'th3', anchor: stored }])
    const rt = createRuntime({ client: client as never, pageKey: 'k', onPlacements: vi.fn() })
    await rt.refresh()
    expect(client.refreshAnchor).toHaveBeenCalledWith('th3', expect.objectContaining({ anchorState: 'anchored' }))
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @comments/client exec vitest run src/anchor/runtime.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement `runtime.ts` (element path)**

```ts
// packages/client/src/anchor/runtime.ts
import type { Anchor } from '@comments/core'
import type { ApiClient } from '../api/client'
import { pinXY, type Box, type XY } from '../positioning/coords'
import type { Placement } from '../positioning/layer'
import { rematch } from './rematch'

export type RuntimeOptions = {
  client: Pick<ApiClient, 'listThreads' | 'refreshAnchor'>
  pageKey: string
  onPlacements: (placements: Placement[]) => void
  root?: ParentNode
}

const scrollXY = (): XY => ({ x: window.scrollX, y: window.scrollY })

function placementFor(id: string, el: Element, anchor: Anchor, highlight: Box[]): Placement {
  const rect = el.getBoundingClientRect()
  return { id, pin: pinXY(rect, anchor.offset, scrollXY()), highlight, pending: false }
}

export function createRuntime(opts: RuntimeOptions) {
  const root = opts.root ?? document
  // Each placed thread keeps its winner element so we can reposition without re-matching.
  let placed: Array<{ id: string; el: Element; anchor: Anchor; highlight: Box[] }> = []

  function emit() {
    opts.onPlacements(placed.map((p) => placementFor(p.id, p.el, p.anchor, p.highlight)))
  }

  async function refresh() {
    const { threads } = await opts.client.listThreads({ pageKey: opts.pageKey })
    const next: typeof placed = []
    for (const t of threads) {
      const res = rematch(t.anchor, root)
      if (res.kind === 'orphaned') {
        void opts.client.refreshAnchor(t.id, { anchorState: 'orphaned' }).catch(() => {})
        continue
      }
      if (res.healed) {
        void opts.client
          .refreshAnchor(t.id, { anchorState: 'anchored', selectors: res.healed.selectors, signals: res.healed.signals })
          .catch(() => {})
      }
      next.push({ id: t.id, el: res.el, anchor: t.anchor, highlight: [] })
    }
    placed = next
    emit()
  }

  return {
    refresh,
    reposition: emit,
    get placed() { return placed },
  }
}
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm --filter @comments/client exec vitest run src/anchor/runtime.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/anchor/runtime.ts packages/client/src/anchor/runtime.test.ts
git commit -m "M6: createRuntime — list -> rematch -> place -> refreshAnchor (element path)"
```

---

## Task 11: Wire place mode + runtime into `MarkerLayer`; delete the stub

Replace the M5 placeholder behavior: the "+ Comment" button toggles place mode; the next page click captures the element under the cursor and creates a real thread; the runtime renders the pins via `PinLayer` and repositions via `observeReposition`. ESC cancels place mode.

**Files:**
- Modify: `packages/client/src/marker/MarkerLayer.tsx`
- Modify: `packages/client/src/marker/MarkerLayer.test.tsx`
- Delete: `packages/client/src/marker/stub-anchor.ts`, `packages/client/src/marker/stub-anchor.test.ts`

- [ ] **Step 1: Delete the stub and its test**

```bash
git rm packages/client/src/marker/stub-anchor.ts packages/client/src/marker/stub-anchor.test.ts
```

- [ ] **Step 2: Rewrite `MarkerLayer.test.tsx`**

```tsx
// packages/client/src/marker/MarkerLayer.test.tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { mockRect } from '../../test/test-helpers/dom'
import { MarkerLayer } from './MarkerLayer'

function client() {
  return {
    listThreads: vi.fn().mockResolvedValue({ threads: [], nextCursor: null }),
    createThread: vi.fn().mockResolvedValue({ id: 'new1' }),
    refreshAnchor: vi.fn().mockResolvedValue({}),
  }
}

const props = (c: ReturnType<typeof client>) => ({
  client: c as never,
  pageKey: 'k',
  pageUrl: 'https://x.test/p',
  identity: { email: 'a@b.c', name: 'A' },
  onNeedIdentity: (resume: (i: { email: string; name: string }) => void) => resume({ email: 'a@b.c', name: 'A' }),
})

describe('MarkerLayer place mode', () => {
  it('enters place mode on + Comment, captures the clicked element, creates a thread', async () => {
    document.body.innerHTML = '<main><p id="t" class="lead">target text</p></main><div id="widget"></div>'
    mockRect(document.querySelector('#t') as Element, { left: 0, top: 0, width: 80, height: 16 })
    const c = client()
    render(<MarkerLayer {...props(c)} />)
    fireEvent.click(screen.getByTestId('comments-place'))
    // simulate a page click on the target element
    const target = document.querySelector('#t') as Element
    fireEvent.click(target, { clientX: 40, clientY: 8 })
    await waitFor(() => expect(c.createThread).toHaveBeenCalled())
    const body = c.createThread.mock.calls[0][0]
    expect(body.anchor.selectors[1]).toBe('#t')
    expect(body.anchor.offset.fx).toBeCloseTo(0.5)
  })

  it('ESC cancels place mode (a subsequent click does not capture)', async () => {
    document.body.innerHTML = '<main><p id="t">x</p></main>'
    const c = client()
    render(<MarkerLayer {...props(c)} />)
    fireEvent.click(screen.getByTestId('comments-place'))
    fireEvent.keyDown(document, { key: 'Escape' })
    fireEvent.click(document.querySelector('#t') as Element, { clientX: 1, clientY: 1 })
    expect(c.createThread).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 3: Run to verify failure**

Run: `pnpm --filter @comments/client exec vitest run src/marker/MarkerLayer.test.tsx`
Expected: FAIL — new behavior/`data-testid` not present; `makeStubAnchor` import removed.

- [ ] **Step 4: Rewrite `MarkerLayer.tsx`**

```tsx
// packages/client/src/marker/MarkerLayer.tsx
import type { Provenance } from '@comments/core'
import { useCallback, useEffect, useRef, useState } from 'react'
import { captureElement } from '../anchor/capture'
import { createRuntime } from '../anchor/runtime'
import type { ApiClient } from '../api/client'
import { ApiError } from '../api/errors'
import { buildCaptureContext } from '../config'
import type { Identity } from '../identity/storage'
import { observeReposition } from '../positioning/lifecycle'
import { PinLayer, type Placement } from '../positioning/layer'
import { useToast } from '../ui/toast'

export type MarkerLayerProps = {
  client: ApiClient
  pageKey: string
  pageUrl: string
  identity: Identity | null
  onNeedIdentity: (resume: (identity: Identity) => void) => void
  provenance?: Provenance
}

export function MarkerLayer({ client, pageKey, pageUrl, identity, onNeedIdentity, provenance }: MarkerLayerProps) {
  const [placements, setPlacements] = useState<Placement[]>([])
  const [placing, setPlacing] = useState(false)
  const toast = useToast()
  const runtime = useRef<ReturnType<typeof createRuntime> | null>(null)

  // Build the runtime once per (client, pageKey); refresh + observe for the lifetime of that pageKey.
  useEffect(() => {
    const rt = createRuntime({ client, pageKey, onPlacements: setPlacements })
    runtime.current = rt
    void rt.refresh()
    const stop = observeReposition({
      targets: [],
      onReposition: () => rt.reposition(),
      onRouteChange: () => {}, // pageKey re-key handled by the host re-mounting MarkerLayer (Task 13)
    })
    return () => { stop(); runtime.current = null }
  }, [client, pageKey])

  const createAt = useCallback(
    async (el: Element, point: { x: number; y: number }, who: Identity) => {
      try {
        await client.createThread({
          pageUrl,
          pageKey,
          anchor: captureElement(el, point),
          comment: { text: 'Placeholder comment' }, // composer is M7
          author: { email: who.email, name: who.name },
          captureContext: buildCaptureContext(),
          provenance,
        })
        await runtime.current?.refresh()
      } catch (err) {
        toast(err instanceof ApiError ? err.message : 'Failed to create comment')
      }
    },
    [client, pageKey, pageUrl, provenance, toast],
  )

  // While placing: one-shot capture of the next page click; ESC cancels.
  useEffect(() => {
    if (!placing) return
    const onClick = (e: MouseEvent) => {
      const target = e.target as Element | null
      if (!target || (target as HTMLElement).dataset.commentsPlace !== undefined) return
      e.preventDefault()
      e.stopPropagation()
      setPlacing(false)
      const el = document.elementFromPoint(e.clientX, e.clientY) ?? target
      const point = { x: e.clientX, y: e.clientY }
      if (identity) void createAt(el, point, identity)
      else onNeedIdentity((who) => void createAt(el, point, who))
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setPlacing(false) }
    document.addEventListener('click', onClick, true)
    document.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('click', onClick, true)
      document.removeEventListener('keydown', onKey, true)
    }
  }, [placing, identity, createAt, onNeedIdentity])

  return (
    <>
      <PinLayer placements={placements} />
      <button
        type="button"
        data-comments-place
        data-testid="comments-place"
        onClick={() => setPlacing((p) => !p)}
        className="cmnt:rounded-full cmnt:shadow-lg"
        style={{
          position: 'absolute', bottom: 16, right: 16, padding: '8px 14px',
          background: placing ? '#1e40af' : '#2563eb', color: '#fff', border: 'none',
          cursor: 'pointer', pointerEvents: 'auto',
        }}
      >
        {placing ? 'Click an element…' : '+ Comment'}
      </button>
    </>
  )
}
```

- [ ] **Step 5: Run to verify pass**

Run: `pnpm --filter @comments/client exec vitest run src/marker/MarkerLayer.test.tsx`
Expected: PASS.

- [ ] **Step 6: Run the full client suite (catch any M5 wiring fallout)**

Run: `pnpm --filter @comments/client test`
Expected: PASS (all green; stub-anchor references gone).

- [ ] **Step 7: Commit**

```bash
git add -A packages/client/src/marker
git commit -m "M6: MarkerLayer place mode + runtime/PinLayer; delete stub-anchor (element pin end-to-end)"
```

---

## Task 12: Text selection — `captureSelection`, selection re-match, `selectionLost`

Layer selection on top of the element path. Top-level anchor describes the range's common-ancestor element (so a lost quote still leaves an element pin); `selection` carries quote/prefix/suffix + endpoints. `rematch` runs `locateQuote` over the winner's text; a miss → `selectionLost`. The runtime maps `selectionLost` to `refreshAnchor({ anchorState:'anchored', selectionLost:true })`.

**Files:**
- Modify: `packages/client/src/anchor/capture.ts` (+ test)
- Modify: `packages/client/src/anchor/rematch.ts` (+ test)
- Modify: `packages/client/src/anchor/runtime.ts` (+ test)

- [ ] **Step 1: Write failing capture test**

```ts
// append to packages/client/src/anchor/capture.test.ts
import { captureSelection } from './capture'

describe('captureSelection', () => {
  it('captures quote/prefix/suffix and a schema-valid anchor on the common-ancestor element', () => {
    document.body.innerHTML = '<article id="a"><p>The quick brown fox jumps over the lazy dog.</p></article>'
    const textNode = document.querySelector('p')?.firstChild as Text
    const range = document.createRange()
    const full = textNode.textContent ?? ''
    const start = full.indexOf('brown fox')
    range.setStart(textNode, start)
    range.setEnd(textNode, start + 'brown fox'.length)
    const anchor = captureSelection(range)
    expect(anchor.selection?.quote).toBe('brown fox')
    expect(anchor.selection?.prefix.endsWith('quick ')).toBe(true)
    expect(anchor.selection?.suffix.startsWith(' jumps')).toBe(true)
    expect(() => Anchor.parse(anchor)).not.toThrow()
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @comments/client exec vitest run src/anchor/capture.test.ts`
Expected: FAIL — `captureSelection` not exported.

- [ ] **Step 3: Implement `captureSelection` (append to `capture.ts`)**

```ts
// append to packages/client/src/anchor/capture.ts
const QUOTE_CONTEXT = 32

function endpointFor(node: Node, offset: number): { selectors: [string, string]; textNodeIndex: number; offset: number } {
  const el = (node.nodeType === Node.TEXT_NODE ? node.parentElement : (node as Element)) as Element
  const textNodes = Array.from(el.childNodes).filter((n) => n.nodeType === Node.TEXT_NODE)
  const textNodeIndex = Math.max(0, textNodes.indexOf(node as ChildNode))
  return { selectors: buildSelectors(el), textNodeIndex, offset }
}

export function captureSelection(range: Range): Anchor {
  const container = (range.commonAncestorContainer.nodeType === Node.TEXT_NODE
    ? range.commonAncestorContainer.parentElement
    : (range.commonAncestorContainer as Element)) as Element
  const fullText = container.textContent ?? ''
  const quote = range.toString()
  const at = fullText.indexOf(quote)
  const prefix = at >= 0 ? fullText.slice(Math.max(0, at - QUOTE_CONTEXT), at) : ''
  const suffix = at >= 0 ? fullText.slice(at + quote.length, at + quote.length + QUOTE_CONTEXT) : ''
  const rect = range.getBoundingClientRect()
  const box = container.getBoundingClientRect()
  return {
    schemaVersion: ANCHOR_SCHEMA_VERSION,
    selectors: buildSelectors(container),
    signals: extractSignals(container),
    offset: {
      fx: offsetWithin(rect.left, { start: box.left, size: box.width }),
      fy: offsetWithin(rect.top, { start: box.top, size: box.height }),
    },
    selection: {
      start: endpointFor(range.startContainer, range.startOffset),
      end: endpointFor(range.endContainer, range.endOffset),
      quote,
      prefix,
      suffix,
    },
  }
}
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm --filter @comments/client exec vitest run src/anchor/capture.test.ts`
Expected: PASS.

- [ ] **Step 5: Write failing rematch selection test**

```ts
// append to packages/client/src/anchor/rematch.test.ts
describe('rematch selection', () => {
  it('returns a range when the quote is found in the matched element', () => {
    const before = parse('<article id="a"><p>The quick brown fox jumps.</p></article>')
    const anchor = anchorFor(before, 'article')
    anchor.selection = { start: anchor.selectors as never as never, end: anchor.selectors as never as never, quote: 'brown fox', prefix: 'quick ', suffix: ' jumps' } as never
    const after = parse('<article id="a"><p>The quick brown fox jumps.</p></article>')
    const res = rematch(anchor, after)
    expect(res.kind).toBe('anchored')
  })

  it('returns selectionLost when the element matches but the quote is gone', () => {
    const before = parse('<article id="a"><p>The quick brown fox jumps.</p></article>')
    const anchor = anchorFor(before, 'article')
    anchor.selection = { start: {} as never, end: {} as never, quote: 'nonexistent phrase', prefix: '', suffix: '' }
    const after = parse('<article id="a"><p>Entirely different content now.</p></article>')
    const res = rematch(anchor, after)
    expect(res.kind === 'selectionLost' || res.kind === 'orphaned').toBe(true)
  })
})
```

Note: the element must still re-anchor in the second case for `selectionLost`; the fixture keeps `#a` + tag stable so the element matches while the quote does not.

- [ ] **Step 6: Run to verify failure**

Run: `pnpm --filter @comments/client exec vitest run src/anchor/rematch.test.ts`
Expected: FAIL — `rematch` ignores `selection`.

- [ ] **Step 7: Add selection handling to `rematch`**

Replace the two `return { kind: 'anchored', el, ... }` sites with a shared resolver that, when `anchor.selection` exists, runs `locateQuote` and downgrades to `selectionLost` on a miss. Add to `rematch.ts`:

```ts
// add import at top of rematch.ts
import { locateQuote } from '@comments/core'

// add helper
function finishMatch(el: Element, anchor: Anchor, healed?: Healed): RematchResult {
  if (!anchor.selection) return { kind: 'anchored', el, healed }
  const offsets = locateQuote(el.textContent ?? '', anchor.selection)
  if (!offsets) return { kind: 'selectionLost', el, healed }
  const range = rangeForOffsets(el, offsets.start, offsets.end)
  return range ? { kind: 'anchored', el, range, healed } : { kind: 'selectionLost', el, healed }
}

/** Map character offsets within el.textContent to a DOM Range across its text nodes. */
function rangeForOffsets(el: Element, start: number, end: number): Range | null {
  const doc = el.ownerDocument
  if (!doc) return null
  const walker = doc.createTreeWalker(el, NodeFilter.SHOW_TEXT)
  const range = doc.createRange()
  let pos = 0
  let started = false
  let node = walker.nextNode() as Text | null
  while (node) {
    const len = node.length
    if (!started && pos + len >= start) { range.setStart(node, start - pos); started = true }
    if (started && pos + len >= end) { range.setEnd(node, end - pos); return range }
    pos += len
    node = walker.nextNode() as Text | null
  }
  return started ? range : null
}
```

Then in `rematch`, change the fast-path success to `return finishMatch(hit, anchor)` and the scored success to `return finishMatch(decision.winner, anchor, healedFrom(decision.winner))`.

- [ ] **Step 8: Run to verify pass**

Run: `pnpm --filter @comments/client exec vitest run src/anchor/rematch.test.ts`
Expected: PASS.

- [ ] **Step 9: Re-run the corpus (selection fixtures exercise selectionLost via runFixture)**

Run: `pnpm --filter @comments/client exec vitest run test/anchor-corpus`
Expected: PASS — `runFixture` already computes `selectionLost` via `locateQuote`; unchanged.

- [ ] **Step 10: Add selection handling to the runtime + test**

Add a runtime test asserting `selectionLost` is reported and the highlight is carried for found quotes:

```ts
// append to packages/client/src/anchor/runtime.test.ts
it('reports selectionLost via refreshAnchor and keeps the element pin', async () => {
  document.body.innerHTML = '<article id="a"><p>Entirely different content now.</p></article>'
  mockRect(document.querySelector('#a') as Element, { left: 0, top: 0, width: 100, height: 20 })
  const anchor = anchorFor('#a')
  anchor.selection = { start: {} as never, end: {} as never, quote: 'missing quote', prefix: '', suffix: '' }
  const client = fakeClient([{ id: 'th4', anchor }])
  const onPlacements = vi.fn()
  const rt = createRuntime({ client: client as never, pageKey: 'k', onPlacements })
  await rt.refresh()
  expect(client.refreshAnchor).toHaveBeenCalledWith('th4', expect.objectContaining({ anchorState: 'anchored', selectionLost: true }))
  expect(onPlacements.mock.calls.at(-1)?.[0]).toHaveLength(1) // element pin retained
})
```

In `runtime.ts`, update the loop to handle `selectionLost` and build highlight boxes from a found range:

```ts
// inside refresh()'s for-loop, replace the body after the orphan check with:
if (res.kind === 'selectionLost') {
  void opts.client.refreshAnchor(t.id, { anchorState: 'anchored', selectionLost: true }).catch(() => {})
  next.push({ id: t.id, el: res.el, anchor: t.anchor, highlight: [] })
  continue
}
if (res.healed) {
  void opts.client
    .refreshAnchor(t.id, { anchorState: 'anchored', selectors: res.healed.selectors, signals: res.healed.signals })
    .catch(() => {})
}
const highlight = res.range ? mapRects(Array.from(res.range.getClientRects()), { x: window.scrollX, y: window.scrollY }) : []
next.push({ id: t.id, el: res.el, anchor: t.anchor, highlight })
```

Add `import { mapRects } from '../positioning/coords'` to `runtime.ts`.

- [ ] **Step 11: Run to verify pass**

Run: `pnpm --filter @comments/client exec vitest run src/anchor/runtime.test.ts`
Expected: PASS.

- [ ] **Step 12: Wire selection capture into place mode**

In `MarkerLayer.tsx`, at the start of the place-mode `onClick` handler (before element capture), branch on an active text selection:

```ts
// at the top of the place-mode onClick, before computing el/point:
const sel = window.getSelection()
if (sel && !sel.isCollapsed && sel.rangeCount > 0) {
  e.preventDefault(); e.stopPropagation(); setPlacing(false)
  const range = sel.getRangeAt(0)
  const run = (who: Identity) => void createSelectionThread(range, who)
  if (identity) run(identity); else onNeedIdentity(run)
  return
}
```

Add a `createSelectionThread` callback mirroring `createAt` but using `captureSelection(range)` for the anchor (import `captureSelection` from `../anchor/capture`). Add a `MarkerLayer.test.tsx` case that selects text, clicks "+ Comment", clicks the page, and asserts `createThread` was called with `body.anchor.selection.quote` set.

```tsx
// append to packages/client/src/marker/MarkerLayer.test.tsx
it('captures a text selection when one is active in place mode', async () => {
  document.body.innerHTML = '<main><p id="p">The quick brown fox jumps.</p></main>'
  const tn = document.querySelector('#p')?.firstChild as Text
  const range = document.createRange()
  const s = (tn.textContent ?? '').indexOf('brown fox')
  range.setStart(tn, s); range.setEnd(tn, s + 'brown fox'.length)
  const selection = window.getSelection()!
  selection.removeAllRanges(); selection.addRange(range)
  const c = client()
  render(<MarkerLayer {...props(c)} />)
  fireEvent.click(screen.getByTestId('comments-place'))
  fireEvent.click(document.querySelector('#p') as Element, { clientX: 5, clientY: 5 })
  await waitFor(() => expect(c.createThread).toHaveBeenCalled())
  expect(c.createThread.mock.calls[0][0].anchor.selection.quote).toBe('brown fox')
})
```

- [ ] **Step 13: Run to verify pass + full suite**

Run: `pnpm --filter @comments/client exec vitest run src/marker src/anchor`
Then: `pnpm --filter @comments/client test`
Expected: PASS (all green).

- [ ] **Step 14: Commit**

```bash
git add packages/client/src/anchor packages/client/src/marker
git commit -m "M6: text selection — captureSelection, locateQuote re-highlight, selectionLost"
```

---

## Task 13: SPA route re-key — re-list + re-match on pageKey change

A URL change that changes `pageKey` is a full re-key (tear down → re-list → re-match), not a reposition. Implement by recomputing `pageKey` on route change and, when it differs, updating the value `MarkerLayer` keys its runtime effect on (so the effect tears down and rebuilds).

**Files:**
- Modify: `packages/client/src/marker/MarkerLayer.tsx` (+ test)

- [ ] **Step 1: Write failing test**

```tsx
// append to packages/client/src/marker/MarkerLayer.test.tsx
it('re-lists threads when the route changes to a new pageKey', async () => {
  document.body.innerHTML = '<main><p id="t">x</p></main>'
  const c = client()
  // resolvePageKey: identity-ish — pageKey derived from pathname for the test
  render(<MarkerLayer {...props(c)} resolvePageKey={(url) => new URL(url).pathname} pageUrl="https://x.test/a" />)
  await waitFor(() => expect(c.listThreads).toHaveBeenCalledTimes(1))
  history.pushState({}, '', 'https://x.test/b')
  window.dispatchEvent(new PopStateEvent('popstate'))
  await waitFor(() => expect(c.listThreads.mock.calls.length).toBeGreaterThanOrEqual(2))
})
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @comments/client exec vitest run src/marker/MarkerLayer.test.tsx`
Expected: FAIL — no `resolvePageKey` prop / no re-key on route change.

- [ ] **Step 3: Implement re-key in `MarkerLayer.tsx`**

Add an optional `resolvePageKey?: (url: string) => string` prop (default: identity returning the `pageKey` prop). Track the effective pageKey in state, recompute it on route change via `observeReposition`'s `onRouteChange`, and key the runtime effect on it:

```tsx
// add to MarkerLayerProps:  resolvePageKey?: (url: string) => string
// inside the component:
const [activeKey, setActiveKey] = useState(pageKey)

// a stable, always-on route watcher recomputes the key (independent of the runtime effect):
useEffect(() => {
  const stop = observeReposition({
    targets: [],
    onReposition: () => {},
    onRouteChange: () => {
      const next = resolvePageKey ? resolvePageKey(window.location.href) : pageKey
      setActiveKey((prev) => (prev === next ? prev : next))
    },
  })
  return stop
}, [resolvePageKey, pageKey])
```

Then change the runtime effect and `createThread` calls to use `activeKey` instead of `pageKey` (the effect's dependency array becomes `[client, activeKey]`, so a key change tears down and rebuilds the runtime → re-list → re-match). The earlier route watcher inside the runtime effect can drop its `onRouteChange` no-op.

- [ ] **Step 4: Run to verify pass**

Run: `pnpm --filter @comments/client exec vitest run src/marker/MarkerLayer.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/marker/MarkerLayer.tsx packages/client/src/marker/MarkerLayer.test.tsx
git commit -m "M6: SPA route re-key — recompute pageKey -> re-list + re-match"
```

---

## Task 14: Full-suite green, typecheck, lint, and bundle-size budget

**Files:** none (verification + any fixups surfaced).

- [ ] **Step 1: Full client test suite**

Run: `pnpm --filter @comments/client test`
Expected: PASS (all M6 + M5 + corpus green).

- [ ] **Step 2: Typecheck the workspace**

Run: `pnpm -w typecheck` (or `pnpm --filter @comments/client typecheck`)
Expected: no errors. Fix any `verbatimModuleSyntax` / type-only import issues inline.

- [ ] **Step 3: Lint/format**

Run: `pnpm -w lint` (Biome). Apply `pnpm -w lint --write` if it only reports formatting.
Expected: clean.

- [ ] **Step 4: Bundle-size budget**

Run: `pnpm --filter @comments/client size`
Expected: within budget. If M6 pushed the widget over, note the overage in the commit body and flag it for M9's CI budget review (do not silently raise the limit).

- [ ] **Step 5: Commit any fixups**

```bash
git add -A
git commit -m "M6: full-suite green — typecheck/lint/size fixups"
```

---

## Self-review notes (spec coverage)

- **Capture (element + selection)** → Tasks 2, 12. NaN-offset guard → Task 2.
- **Re-match (fast path + scoped scored search + decide)** → Tasks 4 (promotion gate), 5 (fast path), 12 (selection).
- **Positioning (coords + layer + observers + route)** → Tasks 6, 8, 9, 13.
- **Orphan (data-layer, refreshAnchor orphaned)** → Task 10.
- **selectionLost (persisted via refreshAnchor)** → Task 12.
- **Self-heal (refreshAnchor anchored + fresh fingerprint)** → Tasks 5 (healed payload), 10 (call).
- **Place-mode trigger; delete stub** → Task 11.
- **§9 testing (corpus extension + mocked rects/observers)** → Tasks 4, 7, and mocked-rect usage throughout.
- **Exit criteria** — element + selection re-anchor (Tasks 5/12), mutation classes (Task 4 corpus), orphan (Task 10), selectionLost (Task 12), scroll/resize/route tracking (Tasks 8/13). Live browser loop is M9 (out of scope).
