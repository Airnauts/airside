import { describe, expect, it } from 'vitest'
import { DEFAULT_THRESHOLDS, DEFAULT_WEIGHTS } from './weights'

describe('DEFAULT_WEIGHTS', () => {
  it('matches architecture §7 numbers', () => {
    expect(DEFAULT_WEIGHTS).toEqual({
      stableAttrs: 0.4,
      text: 0.25,
      classes: 0.15,
      role: 0.1,
      sibling: 0.05,
      ancestor: 0.05,
    })
  })
  it('sums to 1.0 within floating-point tolerance', () => {
    const sum = Object.values(DEFAULT_WEIGHTS).reduce((a, b) => a + b, 0)
    expect(Math.abs(sum - 1)).toBeLessThan(1e-9)
  })
})

describe('DEFAULT_THRESHOLDS', () => {
  it('matches architecture §7 numbers', () => {
    expect(DEFAULT_THRESHOLDS).toEqual({ accept: 0.6, margin: 0.1 })
  })
})
