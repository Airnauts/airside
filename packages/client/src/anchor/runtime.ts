import type { Anchor } from '@comments/core'
import type { ApiClient } from '../api/client'
import { type Box, pinXY, type XY } from '../positioning/coords'
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

  async function refresh() {
    const { threads } = await opts.client.listThreads({ pageKey: opts.pageKey })
    const next: typeof placed = []
    for (const t of threads) {
      const res = rematch(t.anchor, root)
      if (res.kind === 'orphaned') {
        void opts.client.refreshAnchor(t.id, { anchorState: 'orphaned' }).catch(() => {})
        continue
      }
      if (res.healed) {
        void opts.client
          .refreshAnchor(t.id, { anchorState: 'anchored', selectors: res.healed.selectors, signals: res.healed.signals })
          .catch(() => {})
      }
      next.push({ id: t.id, el: res.el, anchor: t.anchor, highlight: [] })
    }
    placed = next
    emit()
  }

  return {
    refresh,
    reposition: emit,
    get placed() { return placed },
  }
}
