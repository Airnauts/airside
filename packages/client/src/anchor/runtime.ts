// packages/client/src/anchor/runtime.ts
import type { Anchor, ThreadListItem, ThreadStatus } from '@comments/core'
import type { ApiClient } from '../api/client'
import { type Box, mapRects, pinXY } from '../positioning/coords'
import type { PlacedThread } from '../threads/state'
import { rematch } from './rematch'

export type RuntimeOptions = {
  client: Pick<ApiClient, 'listThreads' | 'refreshAnchor'>
  pageKey: string
  onPlacements: (placements: PlacedThread[]) => void
  root?: ParentNode
}

type RetainedMatch = { item: ThreadListItem; el: Element; anchor: Anchor; highlight: Box[] }

function toPlacedThread(p: RetainedMatch): PlacedThread {
  const rect = p.el.getBoundingClientRect()
  return { item: p.item, pin: pinXY(rect, p.anchor.offset), highlight: p.highlight }
}

export function createRuntime(opts: RuntimeOptions) {
  const root = opts.root ?? document
  let placed: RetainedMatch[] = []

  function emit() {
    opts.onPlacements(placed.map(toPlacedThread))
  }

  // returns the retained record for a matched thread, or null if orphaned (already reported + dropped).
  // `anchor` is the fingerprint to match against: the list item's anchor on the first pass,
  // or the retained (possibly self-healed) anchor on a re-match pass.
  function matchAndReport(item: ThreadListItem, anchor: Anchor): RetainedMatch | null {
    const res = rematch(anchor, root)
    if (res.kind === 'orphaned') {
      void opts.client.refreshAnchor(item.id, { anchorState: 'orphaned' }).catch(() => {})
      return null
    }
    let nextAnchor = anchor
    if (res.healed) {
      void opts.client
        .refreshAnchor(item.id, {
          anchorState: 'anchored',
          selectors: res.healed.selectors,
          signals: res.healed.signals,
          ...(res.kind === 'selectionLost' ? { selectionLost: true } : {}),
        })
        .catch(() => {})
      nextAnchor = { ...anchor, selectors: res.healed.selectors, signals: res.healed.signals }
    } else if (res.kind === 'selectionLost') {
      void opts.client
        .refreshAnchor(item.id, { anchorState: 'anchored', selectionLost: true })
        .catch(() => {})
    }
    const highlight =
      res.kind === 'anchored' && res.range ? mapRects(Array.from(res.range.getClientRects())) : []
    return { item, el: res.el, anchor: nextAnchor, highlight }
  }

  const resizeObs = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => emit()) : null

  function observeWinners() {
    resizeObs?.disconnect()
    for (const p of placed) resizeObs?.observe(p.el)
  }

  async function refresh() {
    const { threads } = await opts.client.listThreads({ pageKey: opts.pageKey })
    placed = threads
      .map((t) => matchAndReport(t, t.anchor))
      .filter((p): p is RetainedMatch => p !== null)
    observeWinners()
    emit()
  }

  function rematchAll() {
    // Re-match from the RETAINED anchor (p.anchor), which may already be self-healed —
    // matching M6 semantics so drift isn't re-detected (and re-POSTed) every mutation frame.
    placed = placed
      .map((p) => matchAndReport(p.item, p.anchor))
      .filter((p): p is RetainedMatch => p !== null)
    observeWinners()
    emit()
  }

  // Patch a cached item's status so subsequent emits (reposition/rematchAll, fired by
  // scroll/resize and by DOM mutations — including the widget's own popover content change)
  // carry the new status instead of clobbering an optimistic store update back to stale.
  function setItemStatus(id: string, status: ThreadStatus) {
    let changed = false
    placed = placed.map((p) => {
      if (p.item.id !== id) return p
      changed = true
      const unresolvedCount = status === 'resolved' ? 0 : Math.max(1, p.item.unresolvedCount)
      return { ...p, item: { ...p.item, status, unresolvedCount } }
    })
    if (changed) emit()
  }

  function dispose() {
    resizeObs?.disconnect()
  }

  return {
    refresh,
    reposition: emit,
    rematchAll,
    setItemStatus,
    dispose,
    get placed() {
      return placed
    },
  }
}
