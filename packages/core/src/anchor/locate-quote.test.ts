import { describe, expect, it } from 'vitest'
import { locateQuote } from './locate-quote'

describe('locateQuote', () => {
  it('returns offsets when prefix+quote+suffix matches', () => {
    const r = locateQuote('hello world friend', {
      quote: 'world',
      prefix: 'hello ',
      suffix: ' friend',
    })
    expect(r).toEqual({ start: 6, end: 11 })
  })
  it('returns offsets when quote is uniquely present', () => {
    const r = locateQuote('see Section 4 below', {
      quote: 'Section 4',
      prefix: '',
      suffix: '',
    })
    expect(r).toEqual({ start: 4, end: 13 })
  })
  it('returns null when quote appears multiple times and prefix/suffix do not disambiguate', () => {
    const r = locateQuote('cat cat cat', { quote: 'cat', prefix: '', suffix: '' })
    expect(r).toBeNull()
  })
  it('uses prefix alone to disambiguate when suffix is missing', () => {
    const r = locateQuote('alpha cat beta cat', {
      quote: 'cat',
      prefix: 'alpha ',
      suffix: '',
    })
    expect(r).toEqual({ start: 6, end: 9 })
  })
  it('uses suffix alone to disambiguate when prefix is missing', () => {
    const r = locateQuote('cat one cat two', {
      quote: 'cat',
      prefix: '',
      suffix: ' two',
    })
    expect(r).toEqual({ start: 8, end: 11 })
  })
  it('returns null when no strategy yields a unique match', () => {
    const r = locateQuote('cat one cat two cat three', {
      quote: 'cat',
      prefix: 'x',
      suffix: 'y',
    })
    expect(r).toBeNull()
  })
  it('normalizes whitespace but returns offsets in the original haystack', () => {
    const haystack = 'the quick   brown\nfox'
    const r = locateQuote(haystack, {
      quote: 'quick brown',
      prefix: 'the ',
      suffix: ' fox',
    })
    expect(r).not.toBeNull()
    if (r) expect(haystack.slice(r.start, r.end)).toBe('quick   brown')
  })
})
