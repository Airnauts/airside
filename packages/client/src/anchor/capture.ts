import { ANCHOR_SCHEMA_VERSION, type Anchor } from '@airnauts/comments-core'
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

const QUOTE_CONTEXT = 32

function endpointFor(
  node: Node,
  offset: number,
): { selectors: [string, string]; textNodeIndex: number; offset: number } {
  const el = (node.nodeType === Node.TEXT_NODE ? node.parentElement : (node as Element)) as Element
  const textNodes = Array.from(el.childNodes).filter((n) => n.nodeType === Node.TEXT_NODE)
  const textNodeIndex = Math.max(0, textNodes.indexOf(node as ChildNode))
  return { selectors: buildSelectors(el), textNodeIndex, offset }
}

export function captureSelection(range: Range): Anchor {
  const container = (
    range.commonAncestorContainer.nodeType === Node.TEXT_NODE
      ? range.commonAncestorContainer.parentElement
      : (range.commonAncestorContainer as Element)
  ) as Element
  const fullText = container.textContent ?? ''
  const quote = range.toString()
  const at = fullText.indexOf(quote)
  const prefix = at >= 0 ? fullText.slice(Math.max(0, at - QUOTE_CONTEXT), at) : ''
  const suffix = at >= 0 ? fullText.slice(at + quote.length, at + quote.length + QUOTE_CONTEXT) : ''
  const box = container.getBoundingClientRect()
  // range.getBoundingClientRect() may not be available in all environments (e.g. jsdom).
  const getRangeRect = (): DOMRect | null => {
    try {
      return typeof range.getBoundingClientRect === 'function'
        ? range.getBoundingClientRect()
        : null
    } catch {
      return null
    }
  }
  const rect = getRangeRect()
  return {
    schemaVersion: ANCHOR_SCHEMA_VERSION,
    selectors: buildSelectors(container),
    signals: extractSignals(container),
    offset: rect
      ? {
          fx: offsetWithin(rect.left, { start: box.left, size: box.width }),
          fy: offsetWithin(rect.top, { start: box.top, size: box.height }),
        }
      : { fx: 0.5, fy: 0.5 },
    selection: {
      start: endpointFor(range.startContainer, range.startOffset),
      end: endpointFor(range.endContainer, range.endOffset),
      quote,
      prefix,
      suffix,
    },
  }
}
