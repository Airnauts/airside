import { describe, expect, it } from 'vitest'
import { normalizePageKey } from './pageKey'

describe('normalizePageKey', () => {
  it('keeps origin + pathname', () => {
    expect(normalizePageKey('https://x.com/search')).toBe('https://x.com/search')
  })
  it('strips a trailing slash except on root', () => {
    expect(normalizePageKey('https://x.com/a/b/')).toBe('https://x.com/a/b')
    expect(normalizePageKey('https://x.com/')).toBe('https://x.com/')
  })
  it('drops query and hash', () => {
    expect(normalizePageKey('https://x.com/a?q=1#frag')).toBe('https://x.com/a')
  })
  it('preserves the port (part of origin)', () => {
    expect(normalizePageKey('https://x.com:3000/a')).toBe('https://x.com:3000/a')
  })
  it('accepts a URL instance', () => {
    expect(normalizePageKey(new URL('https://x.com/a/'))).toBe('https://x.com/a')
  })
})
