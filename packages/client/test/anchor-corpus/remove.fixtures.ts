import type { AnchorFixture } from './types'

export const removeFixtures: AnchorFixture[] = [
  {
    name: 'target deleted — orphaned/noCandidates',
    mutationClass: 'remove',
    beforeHtml: '<main id="root"><section><button id="cta">Sign in</button></section></main>',
    afterHtml: '<main id="root"><section></section></main>',
    targetInBefore: '#cta',
    expected: { kind: 'orphaned', reason: 'noCandidates' },
    notes: 'No surviving button → fallback enumeration returns empty → noCandidates.',
  },
  {
    name: 'ancestor landmark deleted — fallback scope still finds target',
    mutationClass: 'remove',
    beforeHtml:
      '<main id="root"><section data-testid="hero"><button id="cta" class="btn">Sign in</button></section></main>',
    afterHtml: '<main id="root"><button id="cta" class="btn">Sign in</button></main>',
    targetInBefore: '#cta',
    expected: { kind: 'anchored', targetInAfter: '#cta' },
    notes:
      'Trail entries section[data-testid=hero] and main#root are checked nearest-first; section is gone, main#root survives → scope to it → finds the button.',
  },
]
