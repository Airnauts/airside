# Known Issues

Issues surfaced by the M10 end-to-end verification suite (`examples/nextjs-host/e2e/`).
Each entry records what was observed, the root cause in the code, the impact, and how
the e2e suite currently relates to it.

> Resolved during M10: **attachments were dropped on save** (`create-thread`/`add-comment`
> hardcoded `attachments: []` and ignored `attachmentIds`). Fixed on `main`
> (`5c49b14` — `resolveAttachments`); the e2e now asserts the posted attachment persists.

---

## A. A signal-less element cannot re-anchor under structural mutation

**Status:** open · known limitation of the v1 scoring policy.

**Observed.** An element pin placed on a plain `<li>` (no `id`, `class`, `role`,
`data-*`, or `data-testid`) **orphans** when the page is reloaded with the list wrapped
in an extra container (`?variant=wrapped` in the e2e article page). The positional
selector (`li:nth-of-type(2)`) breaks under wrapping, so re-match falls to the scored
path — and the element scores below the accept threshold.

**Root cause.** `packages/core/src/anchor/weights.ts`:

```
stableAttrs 0.40 · text 0.25 · classes 0.15 · role 0.10 · sibling 0.05 · ancestor 0.05
accept = 0.60
```

A signal-less element's maximum score is `text 0.25 + sibling 0.05 + ancestor 0.05 = 0.35`,
which is below `accept = 0.60`, so `decide()` returns `orphaned: belowAccept`. Note the
ceiling is strict: even `text + classes (0.25 + 0.15 = 0.40)` is still below threshold —
**only a stable attribute (`id` or a `data-*`, weight 0.40) lifts a content element over
the line** (`0.25 + 0.40 = 0.65`). Since selectors are built only from `id`/`data-testid`,
a non-id `data-*` raises the *score* without making the *selector* survive wrapping — i.e.
it is the only way a content element re-anchors via the **scored** path rather than the
fast path.

**Impact.** Pins on generic structural elements (bare `<li>`, `<div>`, `<p>` with short
text) do not survive wrapper/restructuring mutations; they orphan. Real targets that
carry an `id`, a `data-*`, or distinctive longer text fare better. This may be acceptable
v1 behavior, or it may warrant revisiting the weight/threshold calibration (the M2b
scoring corpus) so that text + structural signals alone clear the bar.

**How the e2e relates.** The mutation re-anchor tests deliberately give the target `<li>`
a `data-anchor` attribute (see the comment in `examples/nextjs-host/app/article/page.tsx`)
so the **scored** re-anchor path is exercised above threshold. The bare-element ceiling is
this finding, documented rather than asserted.

---

## B. Tag-only fast-path agreement produces a confidently-wrong pin on sibling removal

**Status:** open · correctness issue (more serious than A).

**Observed.** An element pin on a plain `<li>` whose anchored node is **removed**
(`?variant=removed`) does not always orphan — for a signal-less element the pin can
re-anchor onto the **wrong surviving sibling**, i.e. a confidently-wrong pin. (The e2e
masks this with `data-anchor`; without it, the removed-variant case mis-anchors instead
of orphaning.)

**Root cause.** `packages/client/src/anchor/rematch.ts` — the fast path:

```ts
export function signalsAgree(stored: Signals, el: Element): boolean {
  if (stored.tag.toLowerCase() !== el.tagName.toLowerCase()) return false
  for (const [k, v] of Object.entries(stored.stableAttrs ?? {})) { ... }
  return true
}
```

For a signal-less element `stored.stableAttrs` is empty, so `signalsAgree` returns `true`
on a **tag match alone**. When the original `<li>` is removed, the stored positional
selector `li:nth-of-type(2)` re-resolves (uniquely) onto the next surviving `<li>`;
`resolveUnique` hits it, `signalsAgree` accepts it on tag, and `finishMatch` anchors the
pin there. Element anchors have no `selection` quote to disambiguate, so nothing catches
the substitution.

**Impact.** This is exactly the "a confidently wrong pin is worse than an honest needs-
review" failure the product copy warns against: a reviewer's comment silently moves to a
*different* element after the original is deleted. Trust-eroding for the re-anchor
guarantee in PRD §7.

**Candidate fix.** Require a corroborating signal beyond tag before the fast path accepts
when the stored element had no `stableAttrs` (e.g. fall through to scoring, or require a
minimum text/structural agreement). Backend/client logic is built test-first (ADR-0010),
so this wants a failing rematch test first (bare element + removed sibling ⇒ `orphaned`),
then the guard.

**How the e2e relates.** The orphan test gives the target a `data-anchor`, so
`signalsAgree` rejects the sibling (it lacks `data-anchor`), re-match falls to scoring,
scoring is below threshold, and the thread orphans correctly. The bare-element mis-anchor
is this finding, documented rather than asserted.
