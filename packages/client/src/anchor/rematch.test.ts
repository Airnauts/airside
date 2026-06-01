import { ANCHOR_SCHEMA_VERSION, type Anchor } from '@airnauts/comments-core'
import { describe, expect, it } from 'vitest'
import { extractSignals } from './extract'
import { rematch } from './rematch'
import { buildSelectors } from './selectors'

const parse = (html: string): HTMLElement =>
  new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html').body

function anchorFor(root: ParentNode, selector: string): Anchor {
  const el = root.querySelector(selector) as Element
  return {
    schemaVersion: ANCHOR_SCHEMA_VERSION,
    selectors: buildSelectors(el),
    signals: extractSignals(el),
    offset: { fx: 0.5, fy: 0.5 },
  }
}

describe('rematch fast path', () => {
  it('anchors via unique selector + agreeing signals, with no healed payload', () => {
    const before = parse('<main><p id="t" class="lead">hello</p></main>')
    const anchor = anchorFor(before, '#t')
    const after = parse('<main><p id="t" class="lead">hello</p></main>')
    const res = rematch(anchor, after)
    expect(res.kind).toBe('anchored')
    if (res.kind === 'anchored') {
      expect(res.el).toBe(after.querySelector('#t'))
      expect(res.healed).toBeUndefined()
    }
  })

  it('falls through to scored search when both selectors miss, emitting healed', () => {
    // data-foo survives (a scored stableAttr worth +0.40) but is NOT used by the #id/[data-testid]
    // selector form; wrapper + class rename make BOTH fast-path selectors miss, so scoring must do
    // the work -> the match is "drifted" -> a healed payload is emitted. (Verified to score ~0.73.)
    const before = parse(
      '<section><p class="lead" data-foo="bar">unique alpha beta gamma delta</p></section>',
    )
    const anchor = anchorFor(before, 'p')
    const after = parse(
      '<section><div class="wrap"><p class="renamed" data-foo="bar">unique alpha beta gamma delta</p></div></section>',
    )
    const res = rematch(anchor, after)
    expect(res.kind).toBe('anchored')
    if (res.kind === 'anchored') {
      expect(res.el).toBe(after.querySelector('p'))
      expect(res.healed?.signals.tag).toBe('p')
    }
  })

  it('orphans when nothing clears the threshold', () => {
    const before = parse('<main><p id="t" class="lead">unique snippet here</p></main>')
    const anchor = anchorFor(before, '#t')
    const after = parse('<main><span>totally different</span></main>')
    const res = rematch(anchor, after)
    expect(res.kind).toBe('orphaned')
  })

  it('orphan carries diagnostics: top scores below the accept threshold', () => {
    // Same tag (p) survives so there IS a candidate, but text/classes differ enough
    // that the best total falls under accept (0.6) -> belowAccept with a non-empty top.
    const before = parse('<main><p id="t" class="lead">unique snippet here alpha beta</p></main>')
    const anchor = anchorFor(before, '#t')
    const after = parse('<main><p class="other">completely unrelated wording entirely</p></main>')
    const res = rematch(anchor, after)
    expect(res.kind).toBe('orphaned')
    if (res.kind === 'orphaned') {
      expect(res.reason).toBe('belowAccept')
      expect(res.diagnostics.thresholds).toEqual({ accept: 0.6, margin: 0.1 })
      expect(res.diagnostics.candidateCount).toBe(1)
      expect(res.diagnostics.stored.tag).toBe('p')
      expect(res.diagnostics.top.length).toBeGreaterThan(0)
      expect(res.diagnostics.top[0].total).toBeLessThan(0.6)
      // components are present so the weak signals are visible
      expect(res.diagnostics.top[0].components).toHaveProperty('text')
    }
  })

  it('orphan carries diagnostics: no candidates of the stored tag', () => {
    const before = parse('<main><p id="t" class="lead">unique snippet here</p></main>')
    const anchor = anchorFor(before, '#t')
    const after = parse('<main><span>totally different</span></main>')
    const res = rematch(anchor, after)
    expect(res.kind).toBe('orphaned')
    if (res.kind === 'orphaned') {
      expect(res.reason).toBe('noCandidates')
      expect(res.diagnostics.candidateCount).toBe(0)
      expect(res.diagnostics.top).toEqual([])
    }
  })
})

describe('rematch selection', () => {
  const ep = { selectors: ['p', 'p'] as [string, string], textNodeIndex: 0, offset: 0 }

  it('returns a range when the quote is found in the matched element', () => {
    const before = parse('<article id="a"><p>The quick brown fox jumps.</p></article>')
    const anchor = anchorFor(before, 'article')
    anchor.selection = {
      start: ep,
      end: ep,
      quote: 'brown fox',
      prefix: 'quick ',
      suffix: ' jumps',
    }
    const after = parse('<article id="a"><p>The quick brown fox jumps.</p></article>')
    const res = rematch(anchor, after)
    expect(res.kind).toBe('anchored')
    if (res.kind === 'anchored') expect(res.range).toBeTruthy()
  })

  it('returns selectionLost when the element matches but the quote is gone', () => {
    const before = parse('<article id="a"><p>The quick brown fox jumps.</p></article>')
    const anchor = anchorFor(before, 'article')
    anchor.selection = { start: ep, end: ep, quote: 'nonexistent phrase', prefix: '', suffix: '' }
    const after = parse('<article id="a"><p>Entirely different content now.</p></article>')
    const res = rematch(anchor, after)
    expect(res.kind).toBe('selectionLost')
  })
})
