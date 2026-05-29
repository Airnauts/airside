import { describe, expect, it } from 'vitest'
import { mapRects, pinXY } from './coords'

describe('pinXY', () => {
  it('places the pin at the element rect corner + fractional offset (viewport coords)', () => {
    const rect = { left: 100, top: 50, width: 200, height: 40 } as DOMRect
    expect(pinXY(rect, { fx: 0.5, fy: 0.25 })).toEqual({ x: 200, y: 60 })
  })
  it('does NOT add scroll — the overlay is viewport-fixed; recompute-on-scroll keeps pins glued', () => {
    const rect = { left: 10, top: 10, width: 100, height: 100 } as DOMRect
    expect(pinXY(rect, { fx: 0, fy: 0 })).toEqual({ x: 10, y: 10 })
  })
})

describe('mapRects', () => {
  it('reshapes viewport client rects into overlay boxes (no scroll/origin offset)', () => {
    const rects = [{ left: 30, top: 40, width: 10, height: 12 } as DOMRect]
    expect(mapRects(rects)).toEqual([{ x: 30, y: 40, width: 10, height: 12 }])
  })
})
