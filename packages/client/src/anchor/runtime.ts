import type { Anchor } from '@comments/core'
import type { ApiClient } from '../api/client'
import { type Box, mapRects, pinXY, type XY } from '../positioning/coords'
import type { Placement } from '../positioning/layer'
import { rematch } from './rematch'

export type RuntimeOptions = {
  client: Pick<ApiClient, 'listThreads' | 'refreshAnchor'>
  pageKey: string
  onPlacements: (placements: Placement[]) => void
  root?: ParentNode
}

const scrollXY = (): XY => ({ x: window.scrollX, y: window.scrollY })

function placementFor(id: string, el: Element, anchor: Anchor, highlight: Box[]): Placement {
  const rect = el.getBoundingClientRect()
  return { id, pin: pinXY(rect, anchor.offset, scrollXY()), highlight, pending: false }
}

export function createRuntime(opts: RuntimeOptions) {
  const root = opts.root ?? document
  // Each placed thread keeps its winner element so we can reposition without re-matching.
  let placed: Array<{ id: string; el: Element; anchor: Anchor; highlight: Box[] }> = []

  function emit() {
    opts.onPlacements(placed.map((p) => placementFor(p.id, p.el, p.anchor, p.highlight)))
  }

  // returns the retained record for a matched thread, or null if orphaned (already reported + dropped)
  function matchAndReport(
    id: string,
    anchor: Anchor,
  ): { id: string; el: Element; anchor: Anchor; highlight: Box[] } | null {
    const res = rematch(anchor, root)
    if (res.kind === 'orphaned') {
      void opts.client.refreshAnchor(id, { anchorState: 'orphaned' }).catch(() => {})
      return null
    }
    // Heal payload may accompany BOTH anchored and selectionLost (drifted element).
    let nextAnchor = anchor
    if (res.healed) {
      void opts.client
        .refreshAnchor(id, {
          anchorState: 'anchored',
          selectors: res.healed.selectors,
          signals: res.healed.signals,
          ...(res.kind === 'selectionLost' ? { selectionLost: true } : {}),
        })
        .catch(() => {})
      // Update the retained anchor to the healed fingerprint so future re-matches fast-path
      // instead of re-detecting drift and re-POSTing a heal on every mutation frame.
      nextAnchor = { ...anchor, selectors: res.healed.selectors, signals: res.healed.signals }
    } else if (res.kind === 'selectionLost') {
      void opts.client
        .refreshAnchor(id, { anchorState: 'anchored', selectionLost: true })
        .catch(() => {})
    }
    const highlight =
      res.kind === 'anchored' && res.range
        ? mapRects(Array.from(res.range.getClientRects()), { x: window.scrollX, y: window.scrollY })
        : []
    return { id, el: res.el, anchor: nextAnchor, highlight }
  }

  const resizeObs = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => emit()) : null

  function observeWinners() {
    resizeObs?.disconnect()
    for (const p of placed) resizeObs?.observe(p.el)
  }

  async function refresh() {
    const { threads } = await opts.client.listThreads({ pageKey: opts.pageKey })
    placed = threads
      .map((t) => matchAndReport(t.id, t.anchor))
      .filter((p): p is NonNullable<typeof p> => p !== null)
    observeWinners()
    emit()
  }

  function rematchAll() {
    placed = placed
      .map((p) => matchAndReport(p.id, p.anchor))
      .filter((p): p is NonNullable<typeof p> => p !== null)
    observeWinners()
    emit()
  }

  function dispose() {
    resizeObs?.disconnect()
  }

  return {
    refresh,
    reposition: emit,
    rematchAll,
    dispose,
    get placed() {
      return placed
    },
  }
}
