import { ANCHOR_SCHEMA_VERSION, type Anchor } from '@airnauts/airside-core'
import { describe, expect, it } from 'vitest'
import { captureSelection } from './capture'
import { extractSignals } from './extract'
import { findCandidates, rematch } from './rematch'
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

// The Lear bug: our widget root is a <body>-level sibling of the page content, so a naive
// nth-of-type counts it and the stored structural path resolves to the wrong element (or nothing)
// after the widget mounts. The engine must treat all [data-airside-root] DOM as absent.
describe('rematch — airside widget DOM excluded from anchoring', () => {
  it('still anchors to the right element when our root shifts body-level nth-of-type', () => {
    const before = parse(
      '<div class="card"><span class="label">A</span></div><div class="card"><span class="label">B</span></div>',
    )
    const anchor = anchorFor(before, '.card:nth-of-type(2) span') // the "B" span
    expect(anchor.selectors[0]).toBe('div:nth-of-type(2) > span')
    // Re-render with our widget root prepended as the first <body> div (as it appears live).
    const after = parse(
      '<div data-airside-root><button><span class="label">widget</span></button></div><div class="card"><span class="label">A</span></div><div class="card"><span class="label">B</span></div>',
    )
    const res = rematch(anchor, after)
    expect(res.kind).toBe('anchored')
    // Crucially the RIGHT card: a native nth-of-type(2) would have counted the airside div and
    // pinned to "A".
    if (res.kind === 'anchored') expect(res.el.textContent).toBe('B')
  })

  it('survives a host portal (Floating UI) prepended at body level', () => {
    const before = parse(
      '<div class="card"><span class="label">A</span></div><div class="card"><span class="label">B</span></div>',
    )
    const anchor = anchorFor(before, '.card:nth-of-type(2) span') // the "B" span
    // A host SPA renders a floating-ui portal as the first body child (open dropdown/tooltip).
    const after = parse(
      '<div data-floating-ui-portal><div>menu</div></div><div class="card"><span class="label">A</span></div><div class="card"><span class="label">B</span></div>',
    )
    const res = rematch(anchor, after)
    expect(res.kind).toBe('anchored')
    if (res.kind === 'anchored') expect(res.el.textContent).toBe('B')
  })

  it('findCandidates skips ignored DOM (the empty-first-div noCandidates/wrong-scope trap)', () => {
    const root = parse(
      '<div data-airside-root><span>widget</span></div><section><span class="t">target</span></section>',
    )
    // Nearest trail entry "div" would otherwise match our root first and scope the search into it.
    const candidates = findCandidates(root, { tag: 'span', ancestorTrail: ['div', 'section'] })
    expect(candidates.length).toBe(1)
    expect(candidates[0]?.textContent).toBe('target')
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

// End-to-end #35: capture a real cross-</code> selection (NOT a hand-faked anchor), then rematch
// against the host DOM after a re-render. Pre-fix these anchored to the bare <p> and were lost.
describe('rematch — cross-element selection survives a re-render (#35)', () => {
  const captureCrossCode = (html: string): Anchor => {
    document.body.innerHTML = html
    const code = document.querySelector('code') as Element
    const codeText = code.firstChild as Text
    const trailing = code.nextSibling as Text
    const range = document.createRange()
    range.setStart(codeText, (codeText.textContent ?? '').indexOf('dev-key'))
    const tail = trailing.textContent ?? ''
    range.setEnd(trailing, tail.indexOf('activate') + 'activate'.length)
    return captureSelection(range)
  }

  it('tier-2 single-article host survives an intra-article paragraph shift', () => {
    const anchor = captureCrossCode(
      '<article><p>intro paragraph one</p><p>filler paragraph two</p><p>Open this page with <code>?airside-key=dev-key</code> to activate the widget.</p></article>',
    )
    expect(anchor.signals.tag).toBe('article')
    const after = parse(
      '<article><p>intro paragraph one</p><p>filler paragraph two</p><p>freshly inserted paragraph</p><p>Open this page with <code>?airside-key=dev-key</code> to activate the widget.</p></article>',
    )
    const res = rematch(anchor, after)
    expect(res.kind).toBe('anchored')
    if (res.kind === 'anchored') {
      expect(res.range?.toString()).toBe(anchor.selection?.quote)
    }
  })

  it('tier-3 multi-article host survives an intra-article paragraph insertion', () => {
    const anchor = captureCrossCode(
      '<main><article><p>first article para</p></article><article><p>filler para two</p><p>Open this page with <code>?airside-key=dev-key</code> to activate the widget.</p></article><article><p>third article para</p></article></main>',
    )
    expect(anchor.signals.tag).toBe('article')
    expect(anchor.selectors[0]).toBe('main > article:nth-of-type(2)')
    const after = parse(
      '<main><article><p>first article para</p></article><article><p>filler para two</p><p>freshly inserted paragraph</p><p>Open this page with <code>?airside-key=dev-key</code> to activate the widget.</p></article><article><p>third article para</p></article></main>',
    )
    const res = rematch(anchor, after)
    expect(res.kind).toBe('anchored')
    if (res.kind === 'anchored') {
      expect(res.range?.toString()).toBe(anchor.selection?.quote)
    }
  })
})
