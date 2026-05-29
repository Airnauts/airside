export type XY = { x: number; y: number }
export type Box = { x: number; y: number; width: number; height: number }

// The widget overlay is `position: fixed` (viewport-anchored — see app/mount.tsx), so pin and
// highlight coordinates are VIEWPORT-relative (getBoundingClientRect space) and must NOT include
// scroll offset. The runtime recomputes on scroll/resize (observeReposition) to keep pins glued to
// their elements; adding scroll here would freeze pins at a screen spot as the page scrolls away.

/** Pin position in viewport coords: element rect corner + fractional offset within the element. */
export function pinXY(
  rect: { left: number; top: number; width: number; height: number },
  offset: { fx: number; fy: number },
): XY {
  return {
    x: rect.left + offset.fx * rect.width,
    y: rect.top + offset.fy * rect.height,
  }
}

/** Reshape client rects (already viewport-relative) into overlay boxes. */
export function mapRects(
  rects: ReadonlyArray<{ left: number; top: number; width: number; height: number }>,
): Box[] {
  return rects.map((r) => ({ x: r.left, y: r.top, width: r.width, height: r.height }))
}
