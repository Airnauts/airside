import { describe, expect, it } from 'vitest'
import { installObserverSpies, mockRect } from './dom'

describe('mockRect', () => {
  it('overrides getBoundingClientRect', () => {
    const el = document.createElement('div')
    mockRect(el, { left: 1, top: 2, width: 3, height: 4 })
    expect(el.getBoundingClientRect()).toMatchObject({ left: 1, top: 2, width: 3, height: 4 })
  })
})

describe('installObserverSpies', () => {
  it('captures ResizeObserver + MutationObserver callbacks and lets the test fire them', () => {
    const spies = installObserverSpies()
    try {
      let resized = 0
      const ro = new ResizeObserver(() => { resized++ })
      ro.observe(document.body)
      spies.fireResize()
      expect(resized).toBe(1)

      let mutated = 0
      const mo = new MutationObserver(() => { mutated++ })
      mo.observe(document.body, { childList: true })
      spies.fireMutation()
      expect(mutated).toBe(1)
    } finally {
      spies.restore()
    }
  })
})
