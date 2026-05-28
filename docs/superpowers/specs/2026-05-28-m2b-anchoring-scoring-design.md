# M2b — Core: Anchoring Scoring Policy & Fixture Corpus — Design

- **Status:** Approved (brainstorm complete)
- **Date:** 2026-05-28
- **Milestone:** M2b (Shared · M) — see [`docs/milestones.md`](../../milestones.md)
- **Source of truth:** [`docs/architecture.md`](../../architecture.md) §7, §9 · [`docs/adr.md`](../../adr.md) (ADR-0004, ADR-0008, ADR-0010)
- **Track:** Shared. Depends on: M2a (frozen `Signals` / `Anchor` / `Selection` shapes). Unblocks: **M6 (anchoring runtime) only.**

## 1. Goal & scope

Nail and regression-guard the riskiest pure logic — fingerprint scoring + selection re-find — against a calibrated jsdom corpus, **before M6's runtime consumes it**. The corpus is the ★ of architecture §9: the artifact that turns *"comments reliably re-anchor across redeploys"* (PRD §7) into a measurable property.

### 1.1 Refinement from the milestone wording

The milestone scopes all three pieces (scoring policy, DOM→`signals` extraction, fixture corpus) inside `@comments/core`. This design **splits M2b across two packages** to keep `core` DOM-free and co-locate the only DOM-touching code with M6's eventual home:

- **`@comments/core`** (pure, node-tested) — `scoreCandidate`, `decide`, `locateQuote`, the default weights/thresholds constants, and the `Signals.stableAttrs?` additive field.
- **`@comments/client`** (jsdom-tested) — `extractSignals(el)`, the fixture corpus files, and the corpus runner that wires extraction + scoring.

**Why split.** Keeps `@comments/core` the pure leaf the M2a contract intended: no DOM types in its public surface, no `devDependency` on `client`, no inverted package edges. The corpus runner is naturally where extraction lives. The milestone's "all in core" framing was a sensible default; this is the brainstorm's refinement.

### 1.2 In scope

- Pure scoring policy in core: `scoreCandidate(stored, candidate) → ScoreResult`, `decide(scored[]) → Decision`, default weights/thresholds.
- Pure selection-locator in core: `locateQuote(haystack, ctx)`.
- Additive growth of `Signals` with optional `stableAttrs?: Record<string,string>` so the §7 +0.40 weight rides on a real signal.
- DOM→`Signals` extraction in client: `extractSignals(el: Element)`.
- Fixture corpus + jsdom runner in client, covering the seven §9 mutation classes (wrapper / reorder / rename / text / attr / remove / duplicate).

### 1.3 Out of scope

- Any DOM positioning, overlay layer, `MutationObserver`, `ResizeObserver`, SPA route detection (M6).
- Building the candidate set in production — querySelector fast path, ancestor-landmark scoping, fallback enumeration (M6; the corpus runner ships a minimal duplicate documented as "the M6 contract under test", see §6.2).
- Walking text nodes to convert `locateQuote` offsets into a `Range` (M6).
- Calling `PATCH /threads/:id/anchor` to self-heal stored fingerprints (M6).
- Any HTTP / DB I/O (M3 / M4).
- Threshold calibration against highly dynamic production DOMs (PRD §9 open question; M9 dogfooding).

## 2. Decisions made (this milestone)

The brainstorm settled six choices that shape the design. They're recorded here rather than as a new ADR — ADR-0008 already carries the anchor shape + scoring summary, and these are refinements that fit underneath it. The only one with ADR-level weight is **§3.5 (stable-attr signal extension)**, captured as an amendment note to ADR-0008 in §10.

| # | Area | Choice | Why |
|---|---|---|---|
| 1 | Stable attrs | Extend `Signals` additively with optional `stableAttrs?: Record<string,string>` | The §7 +0.40 weight needs a real field to ride on; deriving from selectors is fragile. Optional + additive ⇒ no breaking change. |
| 2 | M2b/M6 split | Core owns `scoreCandidate` + `decide` + `locateQuote`; client owns the DOM walk | Smallest pure surface, easiest to corpus-test; M6 keeps querySelector + scoping. |
| 3 | Extraction home | `extractSignals` lives in `@comments/client`, not core | Keeps core DOM-free and the leaf of the dependency graph. |
| 4 | Corpus home | Fixtures + runner live in `client` alongside extraction; core ships only pure scoring | Co-locates DOM-touching code; avoids any `core → client` edge. |
| 5 | Score shape | Weighted sum of 0..1 components; `scoreCandidate` returns the full breakdown + total | Breakdown is what makes corpus failures debuggable. |
| 6 | Calibration order | §7 defaults are the contract; fix the fixture before tuning the weight | Avoids overfitting to ~20 fixtures; ADR amendment required if weights change. |

A seventh implicit decision: **no `ANCHOR_SCHEMA_VERSION` bump**. The parser is already forward-compatible, no live data exists pre-launch, so version is a future tool, not load-bearing here.

## 3. Module layout

### 3.1 `@comments/core` additions

```
core/src/
  schemas/
    anchor.ts          # add optional Signals.stableAttrs?: Record<string,string>
  anchor/
    weights.ts         # DEFAULT_WEIGHTS, DEFAULT_THRESHOLDS (the §7 numbers)
    score.ts           # scoreCandidate(stored, candidate) → ScoreResult
    decide.ts          # decide(scored[]) → Decision
    locate-quote.ts    # locateQuote(haystack, ctx) → {start,end} | null
    index.ts           # barrel
  index.ts             # re-export ./anchor
```

### 3.2 `@comments/client` additions

```
client/src/anchor/
  extract.ts           # extractSignals(el: Element) → Signals
  index.ts             # barrel
client/test/anchor-corpus/
  wrapper.fixtures.ts
  reorder.fixtures.ts
  rename.fixtures.ts
  text.fixtures.ts
  attr.fixtures.ts
  remove.fixtures.ts
  duplicate.fixtures.ts
  runner.ts            # loads all fixtures, builds jsdom DOMs, drives extract+score+decide
  runner.test.ts       # one vitest test per fixture
```

`@comments/client` already declares `@comments/core` as a dependency (from M1). No new package-graph edges; nothing depends *into* core's tests.

### 3.3 Public types (the surface M6 imports)

```ts
type ScoreComponents = {
  stableAttrs: number   // 0..1, weight 0.40
  text:        number   // 0..1 (Dice on char bigrams), weight 0.25
  classes:     number   // 0..1 (Jaccard), weight 0.15
  role:        number   // 0|1, weight 0.10
  sibling:     number   // 1/(1+|Δidx|), weight 0.05
  ancestor:    number   // 0..1 (Jaccard on trail), weight 0.05
}

type ScoreResult = {
  total: number                          // 0..1
  components: ScoreComponents
  excluded: false | 'tagMismatch'        // tag mismatch short-circuits to total=0
}

type Decision<T> =
  | { kind: 'anchored';  winner: T; score: ScoreResult }
  | { kind: 'orphaned';  reason: 'noCandidates' | 'belowAccept' | 'ambiguous' }

scoreCandidate(stored: Signals, candidate: Signals): ScoreResult

decide<T>(
  scored: Array<{ ref: T; score: ScoreResult }>,
  opts?: { accept?: number; margin?: number },
): Decision<T>

locateQuote(
  haystack: string,
  ctx: { quote: string; prefix: string; suffix: string },
): { start: number; end: number } | null

extractSignals(el: Element): Signals    // in @comments/client
```

## 4. Signals extension

Additive growth on the M2a-frozen `Signals` schema:

```diff
 export const Signals = z
   .object({
     tag: z.string(),
     role: z.string().optional(),
     textSnippet: z.string().max(120).optional(),
     classes: z.array(z.string()),
     siblingIndex: z.number().int().nonnegative(),
     ancestorTrail: z.array(z.string()),
+    stableAttrs: z.record(z.string(), z.string()).optional(),
   })
   .meta({ id: 'Signals' })
```

- Old anchors validate unchanged (field optional). No `ANCHOR_SCHEMA_VERSION` bump.
- `Signals` already has `.meta({ id: 'Signals' })`, so `zod-openapi` will surface the new field in the regenerated `openapi.json` artifact (the M2a build script re-emits it).
- M2a's existing `anchor.test.ts` schema tests must keep passing; we add one case asserting `stableAttrs` is accepted when present and tolerated when absent.

## 5. Scoring policy

### 5.1 Defaults (locked from architecture §7)

```ts
export const DEFAULT_WEIGHTS = {
  stableAttrs: 0.40,
  text:        0.25,
  classes:     0.15,
  role:        0.10,
  sibling:     0.05,
  ancestor:    0.05,
} as const                                  // sum = 1.00

export const DEFAULT_THRESHOLDS = {
  accept: 0.60,
  margin: 0.10,
} as const
```

### 5.2 Per-component math

Each component returns `0..1`; total = Σ `weight × component`.

- **tag — exclusion gate (not weighted).** `stored.tag.toLowerCase() !== candidate.tag.toLowerCase()` → return `{ total: 0, excluded: 'tagMismatch', components: zeros }`. Case-insensitive defensive even though jsdom and modern browsers lowercase HTML tags.
- **stableAttrs (weight 0.40) — graded by priority.** Per-attr priority: `id` 0.5, `data-testid` 0.3, every other `data-*` key shares the remaining 0.2 evenly (split across keys that the *stored* anchor actually carries). Component = Σ over stored keys of `priority(key) × (storedValue === candidateValue ? 1 : 0)`. Full match → 1.0; missing stored field → component contribution = 0 (so old anchors without `stableAttrs` simply score 0 on this axis, not negative).
- **text (weight 0.25) — Dice on character bigrams.** Compute over `textSnippet` (already capped at 120 chars in M2a). Pad with a space if length < 2. Both sides missing → 0 (absence isn't evidence of similarity).
- **classes (weight 0.15) — Jaccard.** `|A ∩ B| / |A ∪ B|` on the class-token arrays. Both empty → 0.
- **role (weight 0.10) — exact equality.** 1 if both sides defined and equal; else 0. Both undefined → 0.
- **sibling (weight 0.05) — proximity.** `1 / (1 + |stored.siblingIndex − candidate.siblingIndex|)`. Same index → 1.0; off by one → 0.5.
- **ancestor (weight 0.05) — Jaccard on the trail.** Order-insensitive on purpose: a `<div>` wrapper injection should still credit the parent landmark.

### 5.3 `decide` policy

Given `scored: Array<{ ref, score }>`:

1. Drop entries with `score.excluded === 'tagMismatch'`.
2. Sort by `score.total` descending.
3. Empty → `{ kind: 'orphaned', reason: 'noCandidates' }`.
4. `best.score.total < accept` → `{ kind: 'orphaned', reason: 'belowAccept' }`.
5. Two or more survivors and `(best.total − second.total) < margin` → `{ kind: 'orphaned', reason: 'ambiguous' }`.
6. Otherwise → `{ kind: 'anchored', winner: best.ref, score: best.score }`.

### 5.4 What M6 owns (explicitly *not* M2b)

Querying the live DOM for the fast-path stored selector; walking from the nearest surviving ancestor-landmark to enumerate candidates (with fallback by tag); calling `extractSignals` on each; calling `scoreCandidate` and feeding the array to `decide`; acting on the result (positioning, marking `selectionLost`, `PATCH …/anchor` self-heal). M2b's corpus runner re-implements a *minimal* version of candidate enumeration so it can drive end-to-end fixtures before M6 ships — see §6.2.

## 6. Fixture corpus

### 6.1 Fixture shape

```ts
type MutationClass =
  | 'wrapper' | 'reorder' | 'rename' | 'text' | 'attr' | 'remove' | 'duplicate'

type AnchorFixture = {
  name: string                        // unique within file
  mutationClass: MutationClass
  beforeHtml: string                  // full <body>…</body> snippet
  afterHtml:  string
  targetInBefore: string              // CSS selector identifying the captured element
  selection?: { quote: string; prefix: string; suffix: string }
  expected:
    | { kind: 'anchored'; targetInAfter: string; selectionLost?: boolean }
    | { kind: 'orphaned'; reason: 'noCandidates' | 'belowAccept' | 'ambiguous' }
  notes?: string                      // why this case matters / what it guards
}
```

One file per mutation class (`wrapper.fixtures.ts`, etc.); each file exports an array. The runner imports all seven arrays and concatenates.

### 6.2 Runner flow

Per fixture, in jsdom:

1. Parse `beforeHtml`; resolve `targetInBefore`; call `extractSignals(el)`; build a synthetic stored `Anchor` (selectors stubbed — the corpus exercises `signals`, not selector lookup).
2. Parse `afterHtml`. Enumerate candidates: walk to the nearest surviving ancestor in the stored `ancestorTrail`, then collect descendants of stored `tag`; if no trail entry survives, fall back to all elements of stored `tag`.
3. For each candidate, `extractSignals` → `scoreCandidate(stored, candidate)`. Pass the array to `decide`.
4. Assert `decide` result matches `expected`. On `anchored`, also assert the winner matches `targetInAfter`. If `expected.selection`, call `locateQuote` against the winner's `textContent` and assert presence vs. `selectionLost`.

The candidate-enumeration step **duplicates** logic that M6 will own. This is deliberate: M2b ships before M6, so the runner needs *some* enumeration. The runner version is intentionally small, labeled in code as "M6 contract under test", and tracked as an M6 cleanup task to replace with the production export when M6 lands.

Test failure messages include `mutationClass`, fixture `name`, the decision kind, the winner's selector, and the full score breakdown — which is why `scoreCandidate` returns components and not just a number.

### 6.3 Coverage targets (exit bar)

| Mutation class | Minimum cases | What it guards |
|---|---|---|
| wrapper   | 3 | `<div>` injected around target; stableAttrs unchanged → still anchors; ancestor-trail tolerant |
| reorder   | 3 | siblings shuffled → sibling component drops but text/class/stableAttrs hold |
| rename    | 3 | class renamed (Jaccard drops); tag renamed (excludes); role renamed |
| text      | 3 | textSnippet edited but unique; textSnippet rewritten entirely → relies on stableAttrs |
| attr      | 3 | `data-testid` changed → falls back to other signals; `id` changed but `data-testid` stable |
| remove    | 2 | target deleted → `orphaned/noCandidates`; ancestor landmark deleted → fallback scope |
| duplicate | 3 | duplicated siblings → `ambiguous` orphan; prefix/suffix disambiguates the right one when selection-bearing |

Roughly **20 cases** for v1 — enough to lock the §7 defaults without overfitting. The harness is built so new cases are a copy-paste; we grow it during M9 dogfooding against real-world DOMs.

## 7. Selection re-find (`locateQuote`)

Pure string-matching, owned by core. M6 wraps it with a DOM walk to map offsets back to a `Range`.

```ts
locateQuote(
  haystack: string,
  ctx: { quote: string; prefix: string; suffix: string },
): { start: number; end: number } | null
```

Resolution order (first hit wins):

1. **Exact `prefix + quote + suffix`** anywhere in `haystack` → return offsets of the quote slice. Handles "same quote appears twice but only one has the right neighbors".
2. **Unique exact `quote`** (count === 1) → return its offsets.
3. **`prefix + quote`** unique → return. Else **`quote + suffix`** unique → return.
4. Otherwise → `null`. Caller (M6) degrades to a pin with `selectionLost`.

**Whitespace.** Normalize haystack and needles with `text.replace(/\s+/g, ' ').trim()` before matching, then map the matched offsets back to the original haystack via a precomputed index map so returned offsets are valid in the *original* string. Keeps `"the quick   brown\nfox" ≈ "the quick brown fox"` without lying about offsets.

**No fuzzy matching in v1.** Exact-after-normalization only. Edit-distance and approximate matching are a future knob if the corpus shows we need it.

## 8. Extraction (`extractSignals`)

DOM-touching, owned by `@comments/client`. Single source of truth for the DOM→`Signals` mapping — M6's capture code imports this directly, the corpus runner imports the same function. No re-implementation, no drift.

Rules per field:

- **tag** — `el.tagName.toLowerCase()`.
- **role** — `el.getAttribute('role') ?? undefined`. (Computed ARIA role is post-v1.)
- **textSnippet** — `(el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 120)`.
- **classes** — `Array.from(el.classList)`. Empty array (not undefined) when no classes.
- **siblingIndex** — `Array.from(el.parentElement?.children ?? []).indexOf(el)`; `0` for orphan nodes (defensive).
- **ancestorTrail** — walk parents up to (but not including) the document root; for each, record `tag` plus `id` / `data-testid` when present (e.g., `"main#root"`, `"section[data-testid=hero]"`, `"div"`). Cap at 8 entries, nearest-first.
- **stableAttrs** — collect `id` (if non-empty) and every attribute whose name starts with `data-`. Cap at 12 entries total. Empty result → omit the field entirely (omitted and "no stable attrs found" look identical on the wire).

**Determinism.** Same DOM → same `Signals` byte-for-byte at capture (M6) and during corpus runs (M2b). The corpus runner relies on this to assert outcomes without snapshot churn.

## 9. Calibration policy

1. Write the corpus first (ADR-0010 TDD). Fixtures encode what re-anchoring *should* do.
2. Ship `scoreCandidate` / `decide` with the §7 defaults verbatim. Run the corpus.
3. On a failure, **examine the fixture before touching the weights**. Most early "failures" turn out to be the fixture's `expected` encoding a debatable judgment. Fix the fixture if it's wrong; add a `notes:` line if it's right.
4. Adjust weights/thresholds only if **multiple fixtures across different mutation classes** push the same direction. Single-fixture pressure is overfitting, not calibration.
5. Any default change → amend ADR-0008 with the new numbers and the corpus evidence that drove them; re-sync architecture §7.

## 10. ADR-0008 amendment note

ADR-0008 currently summarizes the anchor shape as `Signals { tag, role, textSnippet, classes, siblingIndex, ancestorTrail }`. M2b adds an optional `stableAttrs?: Record<string,string>` so the §7 +0.40 weight rides on a real field rather than being derived from the selector tuple. The change is additive, no `schemaVersion` bump, no migration. ADR-0008 gets a short addendum recording this; the decision itself doesn't merit a fresh ADR because it operates inside ADR-0008's frame.

If the calibration loop (§9) ever changes the §7 default weights or thresholds, *that* warrants a second ADR-0008 addendum recording the numbers and the corpus evidence.

## 11. Test strategy

- **`core/src/anchor/*.test.ts` (node env).** Unit tests for each per-component scorer with hand-built `Signals` pairs; `decide` truth-table tests (empty / single below / single above / tie within margin / clear winner); `locateQuote` string-only fixtures (unique quote, ambiguous quote disambiguated by prefix, by suffix, by both, unresolvable). Runs in the existing core vitest config; no new test env.
- **`client/src/anchor/extract.test.ts` (jsdom env).** Per-field extraction tests covering the §8 determinism rules: tag lowercasing, role absence, textSnippet truncation + whitespace, classes ordering, siblingIndex on orphan, ancestorTrail cap at 8, stableAttrs cap at 12 + omitted-when-empty.
- **`client/test/anchor-corpus/runner.test.ts` (jsdom env).** One vitest test per fixture, generated by iterating the imported arrays.
- **No e2e from M2b.** Real-browser anchoring validation is M9's job.

CI continues to run lint · typecheck · unit · widget-bundle-size budget. M2b adds tests within the existing vitest invocations; no CI changes required.

## 12. Risks

- **Extraction drift between M2b's `extract.ts` and what M6 actually captures.** Mitigation: M6's capture code imports `extractSignals` directly — no re-implementation. The function is the single source of truth; the corpus exercises it end-to-end.
- **Candidate-enumeration duplication.** The corpus runner's enumeration (§6.2) will live alongside M6's eventual production enumeration. Mitigation: keep it minimal, label it in code, track an M6 cleanup task to replace it with the production export when M6 lands.
- **Overfitting to ~20 fixtures.** Mitigation: the calibration policy (§9) prefers fixture review over weight tuning; the corpus locks in a sane policy, it doesn't derive an optimal one.

## 13. Open questions (carried, not blocking M2b)

- **Threshold calibration on real-world dynamic DOMs** (PRD §9). M2b ships §7 defaults; M9 dogfooding informs whether they hold.
- **Computed ARIA role** vs. attribute-only `role`. Quality lift unclear; deferred to post-v1.
- **Fuzzy / normalized-punctuation quote matching.** Deferred until corpus evidence demands it.

## 14. Exit criteria

- `Signals` carries the optional `stableAttrs` field; M2a's schema tests still pass; `openapi.json` regenerated.
- `scoreCandidate`, `decide`, `locateQuote`, and `extractSignals` are pure, deterministic, documented, and each has direct unit tests.
- The corpus runner passes all fixtures across the seven mutation classes with the documented default thresholds — **or** an ADR-0008 addendum records why and how the defaults changed.
- Public barrels of `@comments/core/anchor` and `@comments/client/anchor` are stable surfaces M6 can import without further changes.
- ADR-0008 carries the addendum noting the `stableAttrs` field extension.
