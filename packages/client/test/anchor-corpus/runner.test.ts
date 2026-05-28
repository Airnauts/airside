import { describe, expect, it } from 'vitest'
import { allFixtures } from './index'
import { findCandidates, parseBody, runFixture } from './runner'
import type { AnchorFixture } from './types'

describe('parseBody', () => {
  it('returns the body element of a parsed snippet', () => {
    const body = parseBody('<div id="x"></div>')
    expect(body.querySelector('#x')).not.toBeNull()
  })
})

describe('findCandidates', () => {
  it('returns all descendants of the stored tag when no ancestor survives', () => {
    const body = parseBody('<section><div></div><div></div></section>')
    const candidates = findCandidates(body, { tag: 'div', ancestorTrail: ['main#missing'] })
    expect(candidates.length).toBe(2)
  })
  it('scopes to the nearest surviving ancestor when present', () => {
    const body = parseBody('<main id="root"><section><span></span></section></main><span></span>')
    // Stored trail mentions main#root → enumeration should only look inside main#root.
    const candidates = findCandidates(body, {
      tag: 'span',
      ancestorTrail: ['section', 'main#root'],
    })
    expect(candidates.length).toBe(1)
  })
})

describe('runFixture — end-to-end', () => {
  const fixture: AnchorFixture = {
    name: 'identity smoke',
    mutationClass: 'rename',
    beforeHtml: '<main id="root"><button id="cta" class="btn">Sign in</button></main>',
    afterHtml: '<main id="root"><button id="cta" class="btn">Sign in</button></main>',
    targetInBefore: '#cta',
    expected: { kind: 'anchored', targetInAfter: '#cta' },
  }
  it('anchors an identity fixture to itself', () => {
    const r = runFixture(fixture)
    expect(r.kind).toBe('anchored')
    if (r.kind === 'anchored') expect(r.winnerSelector).toBe('#cta')
  })
})

describe('imported allFixtures', () => {
  if (allFixtures.length === 0) {
    it('no fixtures imported yet (subsequent tasks add them)', () => {
      expect(allFixtures).toEqual([])
    })
  } else {
    it.each(allFixtures)('$mutationClass / $name', (fx) => {
      const r = runFixture(fx)
      expect(r.kind).toBe(fx.expected.kind)
      if (r.kind === 'anchored' && fx.expected.kind === 'anchored') {
        expect(r.winnerSelector).toBe(fx.expected.targetInAfter)
        if (fx.selection) {
          expect(r.selectionLost).toBe(Boolean(fx.expected.selectionLost))
        }
      }
      if (r.kind === 'orphaned' && fx.expected.kind === 'orphaned') {
        expect(r.reason).toBe(fx.expected.reason)
      }
    })
  }
})
