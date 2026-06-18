import { ANCHOR_SCHEMA_VERSION, type Anchor } from '@airnauts/airside-core'
import { extractSignals } from './extract'
import { buildSelectors, resolveUnique, stableSelector, structuralSelector } from './selectors'

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

/** The nearest Element for a node: itself, or the parent of a text node. */
function elementOf(node: Node): Element {
  return (node.nodeType === Node.TEXT_NODE ? node.parentElement : (node as Element)) as Element
}

/** The smallest element fully containing a range (its common-ancestor element). */
function commonAncestorElement(range: Range): Element {
  return elementOf(range.commonAncestorContainer)
}

/** Sectioning/landmark containers eligible for tier-3 positional narrowing. */
const LANDMARK_TAGS = new Set([
  'article',
  'section',
  'main',
  'aside',
  'nav',
  'header',
  'footer',
  'li',
  'figure',
  'blockquote',
])

/** True when `el` is the only child of its parent carrying its tag (no positional index needed). */
function isSoleOfType(el: Element): boolean {
  const parent = el.parentElement
  if (!parent) return false
  return Array.from(parent.children).filter((c) => c.tagName === el.tagName).length === 1
}

/**
 * The element a selection should anchor to. An in-element selection's common ancestor is already
 * the distinctive leaf, so it is returned unchanged. A selection that spans an element boundary,
 * however, has a common ancestor that is often a signal-less block (e.g. a bare `<p>`) which
 * re-anchors to the wrong sibling or orphans after a host re-render (#35). For those, climb
 * `commonEl` → `<body>` (exclusive) and stop at the first ancestor that is distinctively
 * re-locatable, in priority order:
 *   1. a stable landmark whose `stableSelector` (id / data-testid / tag.class) resolves uniquely;
 *   2. a sole-of-type container (the only element of its tag under its parent);
 *   3. a sectioning/landmark container narrowed by its `nth-of-type` structural selector.
 * None up to `<body>` → fall back to `commonEl`. The host always contains `commonEl`, so the
 * quote/prefix/suffix (computed from `commonEl`) stay a substring of the host's text — the
 * containment invariant `locateQuote` relies on.
 */
function anchorHostFor(range: Range): Element {
  const commonEl = commonAncestorElement(range)
  // In-element selection (both endpoints resolve to the same element): behaviour unchanged.
  if (elementOf(range.startContainer) === elementOf(range.endContainer)) return commonEl

  const doc = commonEl.ownerDocument
  const body = doc?.body
  const root = doc?.documentElement
  let cursor: Element | null = commonEl
  while (cursor && cursor !== body && cursor !== root) {
    const el: Element = cursor
    // Tier 1: a stable signal that resolves uniquely.
    if (doc && resolveUnique(stableSelector(el), doc)) return el
    // Tier 2: the only element of its tag under its parent.
    if (isSoleOfType(el)) return el
    // Tier 3: a sectioning/landmark container narrowed by its nth-of-type path.
    if (
      LANDMARK_TAGS.has(el.tagName.toLowerCase()) &&
      doc &&
      resolveUnique(structuralSelector(el), doc)
    ) {
      return el
    }
    cursor = el.parentElement
  }
  return commonEl
}

function endpointFor(
  node: Node,
  offset: number,
): { selectors: [string, string]; textNodeIndex: number; offset: number } {
  const el = elementOf(node)
  const textNodes = Array.from(el.childNodes).filter((n) => n.nodeType === Node.TEXT_NODE)
  const textNodeIndex = Math.max(0, textNodes.indexOf(node as ChildNode))
  return { selectors: buildSelectors(el), textNodeIndex, offset }
}

export function captureSelection(range: Range): Anchor {
  // Quote/prefix/suffix come from the smallest containing element (precise context); the anchor
  // host may climb higher for a cross-element selection (#35), but always contains the container.
  const container = commonAncestorElement(range)
  const host = anchorHostFor(range)
  const fullText = container.textContent ?? ''
  const quote = range.toString()
  const at = fullText.indexOf(quote)
  const prefix = at >= 0 ? fullText.slice(Math.max(0, at - QUOTE_CONTEXT), at) : ''
  const suffix = at >= 0 ? fullText.slice(at + quote.length, at + quote.length + QUOTE_CONTEXT) : ''
  const box = host.getBoundingClientRect()
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
    selectors: buildSelectors(host),
    signals: extractSignals(host),
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
