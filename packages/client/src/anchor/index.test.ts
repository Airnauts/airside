import { describe, expect, it } from 'vitest'
import * as anchor from './index'

describe('@comments/client/anchor barrel', () => {
  it('exports extractSignals', () => {
    expect(typeof anchor.extractSignals).toBe('function')
  })
})
