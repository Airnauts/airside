import { describe, expect, it } from 'vitest'
import { buildSelectors, resolveUnique } from './selectors'

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
})
