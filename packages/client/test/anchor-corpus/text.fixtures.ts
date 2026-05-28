import type { AnchorFixture } from './types'

export const textFixtures: AnchorFixture[] = [
  {
    name: 'text lightly edited — still anchors via Dice + stable id',
    mutationClass: 'text',
    beforeHtml: '<main id="root"><p id="hero">Welcome aboard friend</p></main>',
    afterHtml: '<main id="root"><p id="hero">Welcome aboard, friend</p></main>',
    targetInBefore: '#hero',
    expected: { kind: 'anchored', targetInAfter: '#hero' },
    notes: 'Dice high; id at +0.40. Trivial.',
  },
  {
    name: 'text rewritten entirely — stableAttrs + classes carry it across the threshold',
    mutationClass: 'text',
    beforeHtml:
      '<main id="root"><h2 id="hero" data-testid="hero" class="headline lead">Original headline</h2></main>',
    afterHtml:
      '<main id="root"><h2 id="hero" data-testid="hero" class="headline lead">Completely different copy now</h2></main>',
    targetInBefore: '#hero',
    expected: { kind: 'anchored', targetInAfter: '#hero' },
    notes:
      'Text Dice ≈ 0; but stableAttrs full match (id+data-testid both present → max=0.8, raw=0.8 → component=1.0) contributes 0.40, classes 1×0.15, sibling 1×0.05, ancestor 1×0.05 → ≈ 0.65. Above accept. Shows that even a complete text rewrite re-anchors when both id and data-testid survive AND there is at least one corroborating signal beyond pure structure.',
  },
  {
    name: 'text-bearing element with data-testid and minor text edit',
    mutationClass: 'text',
    beforeHtml:
      '<article><p data-testid="lead" class="lead">The quick brown fox jumps</p></article>',
    afterHtml: '<article><p data-testid="lead" class="lead">The quick red fox jumps</p></article>',
    targetInBefore: '[data-testid="lead"]',
    expected: { kind: 'anchored', targetInAfter: '[data-testid="lead"]' },
    notes:
      'stableAttrs full match → 0.4; text Dice ≈ 0.75 → 0.19; classes 1×0.15; sibling 1×0.05; ancestor 1×0.05 ≈ 0.84. Comfortable margin above accept.',
  },
]
