import type { AnchorFixture } from './types'

export const reorderFixtures: AnchorFixture[] = [
  {
    name: 'siblings shuffled — stable id anchors regardless of position',
    mutationClass: 'reorder',
    beforeHtml: '<ul id="list"><li id="a">A</li><li id="b">B</li><li id="c">C</li></ul>',
    afterHtml: '<ul id="list"><li id="c">C</li><li id="b">B</li><li id="a">A</li></ul>',
    targetInBefore: '#a',
    expected: { kind: 'anchored', targetInAfter: '#a' },
    notes: 'stableAttrs (id) at full weight dominates the sibling-index drop.',
  },
  {
    name: 'siblings shuffled with data-testid — unique stable attr keeps the anchor',
    mutationClass: 'reorder',
    beforeHtml:
      '<section><div class="card" data-testid="alpha">Alpha card</div><div class="card" data-testid="beta">Beta card</div><div class="card" data-testid="gamma">Gamma card</div></section>',
    afterHtml:
      '<section><div class="card" data-testid="beta">Beta card</div><div class="card" data-testid="gamma">Gamma card</div><div class="card" data-testid="alpha">Alpha card</div></section>',
    targetInBefore: '[data-testid="alpha"]',
    expected: { kind: 'anchored', targetInAfter: '[data-testid="alpha"]' },
    notes:
      'data-testid contributes the full 0.4 stableAttrs weight on the matching candidate (max=0.3, raw=0.3 → 1.0); zero on the other two siblings. Sibling drop is overwhelmed by the stable signal → wins by huge margin.',
  },
  {
    name: 'identical siblings with data-row — both clear accept, margin too tight → ambiguous',
    mutationClass: 'reorder',
    beforeHtml:
      '<section><div class="row" data-row="x">x</div><div class="row" data-row="x">x</div><div class="row" data-row="x">x</div></section>',
    afterHtml:
      '<section><div class="row" data-row="x">x</div><div class="row" data-row="x">x</div><div class="row" data-row="x">x</div></section>',
    targetInBefore: 'div.row:nth-of-type(1)',
    expected: { kind: 'orphaned', reason: 'ambiguous' },
    notes:
      'Stored stableAttrs {data-row: x} contributes 0.4. text 1×0.25 + classes 1×0.15 + ancestor 1×0.05 = 0.85 across all three; sibling differs (1.0, 0.5, 0.333 → 0.05, 0.025, 0.017). Best vs second = 0.025, under margin 0.10 → ambiguous. If `data-row` were unique per sibling, this would anchor cleanly.',
  },
]
