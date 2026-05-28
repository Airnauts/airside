import type { AnchorFixture } from './types'

export const wrapperFixtures: AnchorFixture[] = [
  {
    name: 'div wrapper around stable-id button',
    mutationClass: 'wrapper',
    beforeHtml: '<main id="root"><button id="cta" class="btn">Sign in</button></main>',
    afterHtml:
      '<main id="root"><div class="wrap"><button id="cta" class="btn">Sign in</button></div></main>',
    targetInBefore: '#cta',
    expected: { kind: 'anchored', targetInAfter: '#cta' },
    notes: 'A new wrapper changes the trail but stableAttrs.id keeps it well above accept.',
  },
  {
    name: 'wrapper preserves text-only anchor',
    mutationClass: 'wrapper',
    beforeHtml: '<main id="root"><span data-testid="badge">New</span></main>',
    afterHtml: '<main id="root"><div><span data-testid="badge">New</span></div></main>',
    targetInBefore: '[data-testid="badge"]',
    expected: { kind: 'anchored', targetInAfter: '[data-testid="badge"]' },
    notes: 'data-testid carries 0.3 priority on a single-attr stored anchor → full +0.40 weight.',
  },
  {
    name: 'wrapper without stableAttrs falls below accept (documents §7 boundary)',
    mutationClass: 'wrapper',
    beforeHtml: '<main id="root"><section><p class="lead">Welcome aboard</p></section></main>',
    afterHtml:
      '<main id="root"><section><article><p class="lead">Welcome aboard</p></article></section></main>',
    targetInBefore: 'p.lead',
    expected: { kind: 'orphaned', reason: 'belowAccept' },
    notes:
      'Without any stable attribute, even with text=1, classes=1, sibling=1, the §7 weights cap the total at 0.25+0.15+0.05+(partial ancestor)×0.05 ≈ 0.49 — below the 0.60 accept threshold. This documents the boundary §7 deliberately draws: at least one stable signal is needed to anchor. Useful as a regression guard against accidentally weakening the accept threshold.',
  },
]
