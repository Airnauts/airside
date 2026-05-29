import { describe, expect, it } from 'vitest'
import { mapRects, pinXY } from './coords'

describe('pinXY', () => {
  it('places the pin at rect + fractional offset, document-relative', () => {
    const rect = { left: 100, top: 50, width: 200, height: 40 } as DOMRect
    expect(pinXY(rect, { fx: 0.5, fy: 0.25 }, { x: 0, y: 0 })).toEqual({ x: 200, y: 60 })
  })
  it('adds scroll offset to convert viewport coords to document coords', () => {
    const rect = { left: 10, top: 10, width: 100, height: 100 } as DOMRect
    expect(pinXY(rect, { fx: 0, fy: 0 }, { x: 5, y: 25 })).toEqual({ x: 15, y: 35 })
  })
})

describe('mapRects', () => {
  it('translates client rects into the overlay origin space', () => {
    const rects = [{ left: 30, top: 40, width: 10, height: 12 } as DOMRect]
    expect(mapRects(rects, { x: 5, y: 8 })).toEqual([{ x: 35, y: 48, width: 10, height: 12 }])
  })
})
