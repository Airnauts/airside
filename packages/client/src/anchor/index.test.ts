import { describe, expect, it } from 'vitest'
import * as anchor from './index'
import { buildSelectors, captureElement, resolveUnique } from './index'

describe('@airnauts/airside-client/anchor barrel', () => {
  it('exports extractSignals', () => {
    expect(typeof anchor.extractSignals).toBe('function')
  })
})

describe('anchor barrel', () => {
  it('re-exports the capture + selector surface', () => {
    expect(typeof buildSelectors).toBe('function')
    expect(typeof resolveUnique).toBe('function')
    expect(typeof captureElement).toBe('function')
  })
})
