import { describe, expect, it } from 'vitest'
import { Cursor, Email, IsoTimestamp } from './common'

describe('common schemas', () => {
  it('Email accepts a valid address and rejects junk', () => {
    expect(Email.parse('a@b.com')).toBe('a@b.com')
    expect(() => Email.parse('nope')).toThrow()
  })
  it('IsoTimestamp accepts an ISO datetime and rejects a plain date', () => {
    expect(IsoTimestamp.parse('2026-05-27T11:47:26.611Z')).toBe('2026-05-27T11:47:26.611Z')
    expect(() => IsoTimestamp.parse('2026-05-27')).toThrow()
  })
  it('Cursor accepts a non-empty opaque string', () => {
    expect(Cursor.parse('eyJ1IjoxfQ')).toBe('eyJ1IjoxfQ')
    expect(() => Cursor.parse('')).toThrow()
  })
})
