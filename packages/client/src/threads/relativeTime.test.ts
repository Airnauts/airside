import { describe, expect, it } from 'vitest'
import { relativeTime } from './relativeTime'

const now = Date.parse('2026-05-29T12:00:00.000Z')

describe('relativeTime', () => {
  it('returns "just now" under a minute', () => {
    expect(relativeTime('2026-05-29T11:59:30.000Z', now)).toBe('just now')
  })
  it('returns minutes', () => {
    expect(relativeTime('2026-05-29T11:45:00.000Z', now)).toBe('15m')
  })
  it('returns hours', () => {
    expect(relativeTime('2026-05-29T10:00:00.000Z', now)).toBe('2h')
  })
  it('returns days', () => {
    expect(relativeTime('2026-05-26T12:00:00.000Z', now)).toBe('3d')
  })
  it('returns a date past a week', () => {
    expect(relativeTime('2026-05-01T12:00:00.000Z', now)).toMatch(/May/)
  })
  it('clamps future timestamps to "just now"', () => {
    expect(relativeTime('2026-05-29T12:05:00.000Z', now)).toBe('just now')
  })
  it('returns "1m" at exactly 60 seconds', () => {
    expect(relativeTime('2026-05-29T11:59:00.000Z', now)).toBe('1m')
  })
  it('returns "1h" at exactly 60 minutes', () => {
    expect(relativeTime('2026-05-29T11:00:00.000Z', now)).toBe('1h')
  })
  it('returns "7d" at exactly 7 days', () => {
    expect(relativeTime('2026-05-22T12:00:00.000Z', now)).toBe('7d')
  })
})
