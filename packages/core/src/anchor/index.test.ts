import { describe, expect, it } from 'vitest'
import * as anchor from './index'

describe('@airnauts/airside-core/anchor barrel', () => {
  it('exports the scoring + decision + quote-finder + defaults', () => {
    expect(typeof anchor.scoreCandidate).toBe('function')
    expect(typeof anchor.decide).toBe('function')
    expect(typeof anchor.locateQuote).toBe('function')
    expect(anchor.DEFAULT_WEIGHTS.stableAttrs).toBe(0.4)
    expect(anchor.DEFAULT_THRESHOLDS.accept).toBe(0.6)
  })
})
