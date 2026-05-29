import { ANCHOR_SCHEMA_VERSION, type Anchor } from '@comments/core'
import { extractSignals } from './extract'
import { buildSelectors } from './selectors'

export const clamp01 = (n: number): number => Math.max(0, Math.min(1, n))

/** Fractional offset of a coordinate within a 1-D extent; 0.5 when the extent is zero (NaN guard). */
export function offsetWithin(coord: number, extent: { start: number; size: number }): number {
  if (!(extent.size > 0)) return 0.5
  return clamp01((coord - extent.start) / extent.size)
}

export type Point = { x: number; y: number }

export function captureElement(el: Element, point: Point): Anchor {
  const rect = el.getBoundingClientRect()
  return {
    schemaVersion: ANCHOR_SCHEMA_VERSION,
    selectors: buildSelectors(el),
    signals: extractSignals(el),
    offset: {
      fx: offsetWithin(point.x, { start: rect.left, size: rect.width }),
      fy: offsetWithin(point.y, { start: rect.top, size: rect.height }),
    },
  }
}
