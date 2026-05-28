import type { AnchorFixture } from './types'

export const duplicateFixtures: AnchorFixture[] = [
  {
    name: 'duplicated siblings with same data-testid → both clear accept, ambiguous',
    mutationClass: 'duplicate',
    beforeHtml: '<section><div data-testid="card" class="card">Card A</div></section>',
    afterHtml:
      '<section><div data-testid="card" class="card">Card A</div><div data-testid="card" class="card">Card A</div></section>',
    targetInBefore: '[data-testid="card"]',
    expected: { kind: 'orphaned', reason: 'ambiguous' },
    notes:
      'Both candidates carry the same data-testid (full stableAttrs match → 0.4), identical text/classes/ancestor; only siblingIndex differs. Cand 0 total ≈ 0.9, cand 1 ≈ 0.875, margin 0.025 < 0.1 → ambiguous orphan. (Without data-testid, the math instead bottoms out at 0.5 < accept → belowAccept.)',
  },
  {
    name: 'duplicated with stable id on the original — id breaks the tie',
    mutationClass: 'duplicate',
    beforeHtml: '<section><div id="orig" class="card">Card A</div></section>',
    afterHtml:
      '<section><div id="orig" class="card">Card A</div><div class="card">Card A</div></section>',
    targetInBefore: '#orig',
    expected: { kind: 'anchored', targetInAfter: '#orig' },
    notes: 'stableAttrs.id gives the original a 0.40 lead over the dupe → well past margin.',
  },
  {
    name: 'selection-bearing duplicate with same data-testid → ambiguous element; locateQuote never runs',
    mutationClass: 'duplicate',
    beforeHtml:
      '<section><p data-testid="lead" class="lead">The quick brown fox jumps over the lazy dog</p></section>',
    afterHtml:
      '<section><p data-testid="lead" class="lead">The quick brown fox jumps over the lazy dog</p><p data-testid="lead" class="lead">The quick brown fox jumps over the lazy dog</p></section>',
    targetInBefore: '[data-testid="lead"]',
    selection: {
      quote: 'brown fox',
      prefix: 'quick ',
      suffix: ' jumps',
    },
    expected: {
      kind: 'orphaned',
      reason: 'ambiguous',
    },
    notes:
      'Two identical paragraphs (same data-testid, classes, text) → ambiguous element orphan. `locateQuote` never runs because the element pin failed — spec §7 only degrades to selectionLost when the element anchored. This guards against future code that runs locateQuote unconditionally.',
  },
]
