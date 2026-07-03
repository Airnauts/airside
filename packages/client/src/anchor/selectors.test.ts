import { describe, expect, it } from 'vitest'
import {
  buildSelectors,
  isIgnoredForAnchoring,
  resolveStructural,
  resolveUnique,
  structuralSelector,
} from './selectors'

const body = (html: string): HTMLElement => {
  document.body.innerHTML = html
  return document.body
}

describe('buildSelectors', () => {
  it('prefers #id for the class selector and an nth-of-type structural path', () => {
    const root = body('<main><section><p class="lead intro" id="x">hi</p></section></main>')
    const el = root.querySelector('#x') as Element
    const [structural, klass] = buildSelectors(el)
    expect(klass).toBe('#x')
    // structural is an ancestor nth-of-type path that resolves back to el
    expect(root.querySelector(structural)).toBe(el)
  })

  it('falls back to class-path when no id/data-testid', () => {
    const root = body('<div><p class="lead intro">hi</p></div>')
    const el = root.querySelector('p') as Element
    const [, klass] = buildSelectors(el)
    expect(klass).toBe('p.lead.intro')
    expect(root.querySelector(klass)).toBe(el)
  })

  it('builds a climbing nth-of-type path when no ancestor has an id, resolving back to el', () => {
    const root = body('<main><section><p>a</p><p>b</p><p class="t">target</p></section></main>')
    const el = root.querySelector('p.t') as Element
    const [structural] = buildSelectors(el)
    expect(structural).not.toContain('body') // body excluded
    expect(root.querySelector(structural)).toBe(el) // still resolves uniquely
  })

  it('uses data-testid when present and no id', () => {
    const root = body('<div><button data-testid="save">S</button></div>')
    const el = root.querySelector('button') as Element
    const [, klass] = buildSelectors(el)
    expect(klass).toBe('[data-testid="save"]')
  })
})

describe('resolveUnique', () => {
  it('returns the element on a single match', () => {
    const root = body('<div><p id="only">x</p></div>')
    expect(resolveUnique('#only', root)).toBe(root.querySelector('#only'))
  })
  it('returns null on zero or multiple matches', () => {
    const root = body('<div><p class="dup">a</p><p class="dup">b</p></div>')
    expect(resolveUnique('.missing', root)).toBeNull()
    expect(resolveUnique('.dup', root)).toBeNull()
  })
  it('ignores airside-owned matches so a host element still resolves uniquely', () => {
    const root = body(
      '<div data-airside-root><p class="dup">widget</p></div><p class="dup">host</p>',
    )
    const hit = resolveUnique('.dup', root)
    expect(hit?.textContent).toBe('host')
  })
})

describe('isIgnoredForAnchoring', () => {
  it('is true for the widget root and its descendants, false for host content', () => {
    const root = body('<div data-airside-root><span class="w">x</span></div><main><p>y</p></main>')
    expect(isIgnoredForAnchoring(root.querySelector('[data-airside-root]'))).toBe(true)
    expect(isIgnoredForAnchoring(root.querySelector('.w'))).toBe(true)
    expect(isIgnoredForAnchoring(root.querySelector('main'))).toBe(false)
    expect(isIgnoredForAnchoring(root.querySelector('p'))).toBe(false)
  })

  it('ignores built-in host overlay/placeholder containers (portals, hidden, framework chrome)', () => {
    const root = body(
      '<div data-floating-ui-portal><span class="p">menu</span></div>' +
        '<div hidden><span class="h">stream</span></div>' +
        '<next-route-announcer></next-route-announcer>' +
        '<main><p class="real">content</p></main>',
    )
    expect(isIgnoredForAnchoring(root.querySelector('.p'))).toBe(true) // inside a portal
    expect(isIgnoredForAnchoring(root.querySelector('.h'))).toBe(true) // inside [hidden]
    expect(isIgnoredForAnchoring(root.querySelector('next-route-announcer'))).toBe(true)
    expect(isIgnoredForAnchoring(root.querySelector('.real'))).toBe(false)
  })
})

// The Lear bug: our widget root (and host SPA portals) are <body>-level siblings of the page
// content, so a naive nth-of-type counts them and the index drifts. Build + resolution must both
// skip airside nodes so they stay in lockstep.
describe('structuralSelector / resolveStructural — airside nodes excluded', () => {
  it('omits an airside root from the nth-of-type count when building', () => {
    // Without exclusion the content div is the 2nd <div> child of body -> div:nth-of-type(2).
    const root = body('<div data-airside-root>w</div><div class="c"><span class="t">x</span></div>')
    const el = root.querySelector('span.t') as Element
    const [structural] = buildSelectors(el)
    expect(structural).toBe('div > span') // airside excluded -> content div is sole-of-type
    expect(resolveStructural(structural, root)).toBe(el)
  })

  it('keeps the nth index counting only non-airside siblings, and resolves past airside', () => {
    const root = body(
      '<div data-airside-root>w</div><div>a</div><div class="c"><span class="t">x</span></div>',
    )
    const el = root.querySelector('span.t') as Element
    const structural = structuralSelector(el)
    expect(structural).toBe('div:nth-of-type(2) > span') // counted as 2nd of the non-airside divs
    expect(resolveStructural(structural, root)).toBe(el)
    // A native query would mis-resolve the same string (counts the airside div as #1):
    expect(root.querySelector(structural)).not.toBe(el)
  })

  it('also excludes built-in host portals from the index (Floating UI / Radix)', () => {
    const root = body(
      '<div data-floating-ui-portal>menu</div><div>a</div><div class="c"><span class="t">x</span></div>',
    )
    const el = root.querySelector('span.t') as Element
    const structural = structuralSelector(el)
    expect(structural).toBe('div:nth-of-type(2) > span') // the portal div is not counted
    expect(resolveStructural(structural, root)).toBe(el)
  })
})
