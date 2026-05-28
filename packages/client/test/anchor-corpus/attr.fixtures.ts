import type { AnchorFixture } from './types'

export const attrFixtures: AnchorFixture[] = [
  {
    name: 'data-testid changed but id stable',
    mutationClass: 'attr',
    beforeHtml:
      '<main id="root"><button id="cta" data-testid="signin" class="btn">Sign in</button></main>',
    afterHtml:
      '<main id="root"><button id="cta" data-testid="login" class="btn">Sign in</button></main>',
    targetInBefore: '#cta',
    expected: { kind: 'anchored', targetInAfter: '#cta' },
    notes:
      'id still matches (0.5 priority → ~0.625 of the 0.40 budget = 0.25), plus text/classes — well above accept.',
  },
  {
    name: 'id changed but data-testid stable',
    mutationClass: 'attr',
    beforeHtml:
      '<main id="root"><button id="cta-v1" data-testid="signin" class="btn">Sign in</button></main>',
    afterHtml:
      '<main id="root"><button id="cta-v2" data-testid="signin" class="btn">Sign in</button></main>',
    targetInBefore: '#cta-v1',
    expected: { kind: 'anchored', targetInAfter: '#cta-v2' },
    notes: 'data-testid carries; id mismatch contributes 0 on the id slot only.',
  },
  {
    name: 'all stable attrs removed — orphans below accept (documents §7 boundary)',
    mutationClass: 'attr',
    beforeHtml:
      '<main id="root"><button id="cta" data-testid="signin" class="btn primary">Sign in</button></main>',
    afterHtml: '<main id="root"><button class="btn primary">Sign in</button></main>',
    targetInBefore: '#cta',
    expected: { kind: 'orphaned', reason: 'belowAccept' },
    notes:
      'stableAttrs drops to 0; text 1×0.25 + classes 1×0.15 + role 0 + sibling 1×0.05 + ancestor 1×0.05 = 0.50 — below the 0.60 accept threshold. A legitimate orphan: the host stripped every signal §7 considers stable, and pure structural/text agreement is not enough to anchor. Symmetric with wrapper F3 — both fixtures pin the §7 boundary from different mutation classes.',
  },
]
