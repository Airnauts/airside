import { Anchor } from '@comments/core'
import { describe, expect, it } from 'vitest'
import { captureElement, captureSelection, clamp01, offsetWithin } from './capture'

const withRect = (el: Element, r: Partial<DOMRect>): Element => {
  el.getBoundingClientRect = () =>
    ({ x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, toJSON: () => ({}), ...r }) as DOMRect
  return el
}

describe('clamp01 / offsetWithin', () => {
  it('clamps into [0,1]', () => {
    expect(clamp01(-1)).toBe(0)
    expect(clamp01(2)).toBe(1)
    expect(clamp01(0.5)).toBe(0.5)
  })
  it('returns 0.5 for a zero-size extent instead of NaN', () => {
    expect(offsetWithin(0, { start: 0, size: 0 })).toBe(0.5)
    expect(Number.isNaN(offsetWithin(5, { start: 10, size: 0 }))).toBe(false)
  })
  it('computes fractional offset for a real extent', () => {
    expect(offsetWithin(30, { start: 10, size: 40 })).toBe(0.5)
  })
})

describe('captureElement', () => {
  it('produces a schema-valid Anchor with dual selectors, signals, and offset', () => {
    document.body.innerHTML = '<main><p id="t" class="lead">hello world</p></main>'
    const el = withRect(document.querySelector('#t') as Element, { left: 0, top: 0, width: 100, height: 20 })
    const anchor = captureElement(el, { x: 25, y: 10 })
    expect(() => Anchor.parse(anchor)).not.toThrow()
    expect(anchor.offset).toEqual({ fx: 0.25, fy: 0.5 })
    expect(anchor.selectors[1]).toBe('#t')
    expect(anchor.signals.tag).toBe('p')
  })

  it('never emits a NaN offset for a zero-size target', () => {
    document.body.innerHTML = '<div id="z"></div>'
    const el = withRect(document.querySelector('#z') as Element, { width: 0, height: 0 })
    const anchor = captureElement(el, { x: 0, y: 0 })
    expect(() => Anchor.parse(anchor)).not.toThrow()
    expect(anchor.offset).toEqual({ fx: 0.5, fy: 0.5 })
  })
})

describe('captureSelection', () => {
  it('captures quote/prefix/suffix and a schema-valid anchor on the common-ancestor element', () => {
    document.body.innerHTML = '<article id="a"><p>The quick brown fox jumps over the lazy dog.</p></article>'
    const textNode = document.querySelector('p')?.firstChild as Text
    const range = document.createRange()
    const full = textNode.textContent ?? ''
    const start = full.indexOf('brown fox')
    range.setStart(textNode, start)
    range.setEnd(textNode, start + 'brown fox'.length)
    const anchor = captureSelection(range)
    expect(anchor.selection?.quote).toBe('brown fox')
    expect(anchor.selection?.prefix.endsWith('quick ')).toBe(true)
    expect(anchor.selection?.suffix.startsWith(' jumps')).toBe(true)
    expect(() => Anchor.parse(anchor)).not.toThrow()
  })
})
