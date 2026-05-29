export type XY = { x: number; y: number }
export type Box = { x: number; y: number; width: number; height: number }

/** Pin position in document coords: rect corner + fractional offset + scroll. */
export function pinXY(rect: { left: number; top: number; width: number; height: number }, offset: { fx: number; fy: number }, scroll: XY): XY {
  return {
    x: rect.left + offset.fx * rect.width + scroll.x,
    y: rect.top + offset.fy * rect.height + scroll.y,
  }
}

/** Translate client rects into the overlay's coordinate space (origin = overlay's doc-space top-left). */
export function mapRects(rects: ReadonlyArray<{ left: number; top: number; width: number; height: number }>, origin: XY): Box[] {
  return rects.map((r) => ({ x: r.left + origin.x, y: r.top + origin.y, width: r.width, height: r.height }))
}
