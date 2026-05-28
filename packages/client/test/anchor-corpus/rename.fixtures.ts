import type { AnchorFixture } from './types'

export const renameFixtures: AnchorFixture[] = [
  {
    name: 'class renamed — text + role + id keep us anchored',
    mutationClass: 'rename',
    beforeHtml: '<main id="root"><button id="cta" class="btn-primary">Sign in</button></main>',
    afterHtml: '<main id="root"><button id="cta" class="button-primary">Sign in</button></main>',
    targetInBefore: '#cta',
    expected: { kind: 'anchored', targetInAfter: '#cta' },
    notes: 'classes drop to 0 (Jaccard); id (0.40) + text (0.25) easily clear accept.',
  },
  {
    name: 'tag renamed — exclusion gate orphans the anchor',
    mutationClass: 'rename',
    beforeHtml: '<main id="root"><button id="cta" class="btn">Sign in</button></main>',
    afterHtml: '<main id="root"><a id="cta" class="btn" href="#">Sign in</a></main>',
    targetInBefore: '#cta',
    expected: { kind: 'orphaned', reason: 'noCandidates' },
    notes:
      'Tag mismatch excludes every candidate of the new tag; enumeration of the stored "button" tag finds nothing → noCandidates.',
  },
  {
    name: 'role attribute removed — partial signal loss, still anchors',
    mutationClass: 'rename',
    beforeHtml: '<main id="root"><div id="cta" role="button" class="btn">Sign in</div></main>',
    afterHtml: '<main id="root"><div id="cta" class="btn">Sign in</div></main>',
    targetInBefore: '#cta',
    expected: { kind: 'anchored', targetInAfter: '#cta' },
    notes: 'role drops to 0 (now both-missing); id + text + classes well above accept.',
  },
]
