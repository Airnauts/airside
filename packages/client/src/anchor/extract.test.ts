import { describe, expect, it } from 'vitest'
import { extractSignals } from './extract'

const setBody = (html: string): Element => {
  document.body.innerHTML = html
  const el = document.body.firstElementChild
  if (!el) throw new Error('fixture missing root element')
  return el
}

describe('extractSignals — basic fields', () => {
  it('lowercases the tag', () => {
    const el = setBody('<BUTTON></BUTTON>')
    expect(extractSignals(el).tag).toBe('button')
  })
  it('returns role from getAttribute, undefined when absent', () => {
    expect(extractSignals(setBody('<div role="main"></div>')).role).toBe('main')
    expect(extractSignals(setBody('<div></div>')).role).toBeUndefined()
  })
  it('collapses whitespace in textSnippet and truncates at 120 chars', () => {
    const el = setBody('<p>  hello   world  </p>')
    expect(extractSignals(el).textSnippet).toBe('hello world')
    const long = setBody(`<p>${'a'.repeat(150)}</p>`)
    expect(extractSignals(long).textSnippet?.length).toBe(120)
  })
  it('returns classes as an array (empty when none)', () => {
    expect(extractSignals(setBody('<div class="btn primary"></div>')).classes).toEqual([
      'btn',
      'primary',
    ])
    expect(extractSignals(setBody('<div></div>')).classes).toEqual([])
  })
})

describe('extractSignals — siblingIndex', () => {
  it('returns the 0-based index among parent children', () => {
    document.body.innerHTML = '<ul><li></li><li id="t"></li><li></li></ul>'
    const el = document.querySelector('#t')!
    expect(extractSignals(el).siblingIndex).toBe(1)
  })
  it('returns 0 for an orphan node', () => {
    const orphan = document.createElement('div')
    expect(extractSignals(orphan).siblingIndex).toBe(0)
  })
})

describe('extractSignals — ancestorTrail', () => {
  it('records tag + id/data-testid up to (excluding) the document root, nearest-first', () => {
    document.body.innerHTML =
      '<main id="root"><section data-testid="hero"><span id="t"></span></section></main>'
    const el = document.querySelector('#t')!
    const trail = extractSignals(el).ancestorTrail
    // nearest first: section, main, body
    expect(trail[0]).toBe('section[data-testid=hero]')
    expect(trail[1]).toBe('main#root')
    expect(trail[2]).toBe('body')
  })
  it('caps the trail at 8 entries', () => {
    let html = '<div id="t"></div>'
    for (let i = 0; i < 12; i++) html = `<div>${html}</div>`
    document.body.innerHTML = html
    const el = document.querySelector('#t')!
    expect(extractSignals(el).ancestorTrail.length).toBe(8)
  })
})

describe('extractSignals — stableAttrs', () => {
  it('collects id and every data-* attribute', () => {
    const el = setBody('<div id="h" data-testid="cta" data-x="1"></div>')
    expect(extractSignals(el).stableAttrs).toEqual({
      id: 'h',
      'data-testid': 'cta',
      'data-x': '1',
    })
  })
  it('omits the field entirely when there are no stable attrs', () => {
    const el = setBody('<div></div>')
    expect(extractSignals(el).stableAttrs).toBeUndefined()
  })
  it('drops empty id values', () => {
    const el = setBody('<div id="" data-x="1"></div>')
    expect(extractSignals(el).stableAttrs).toEqual({ 'data-x': '1' })
  })
  it('caps stableAttrs at 12 entries (id first, then data-*)', () => {
    const attrs: string[] = []
    for (let i = 0; i < 20; i++) attrs.push(`data-k${i}="${i}"`)
    const el = setBody(`<div id="h" ${attrs.join(' ')}></div>`)
    const s = extractSignals(el).stableAttrs!
    expect(Object.keys(s).length).toBe(12)
    expect(s.id).toBe('h')
    expect(s['data-k0']).toBe('0')
    expect(s['data-k10']).toBe('10')
    expect(s['data-k11']).toBeUndefined()
  })
})
