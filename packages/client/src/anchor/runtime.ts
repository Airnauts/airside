// packages/client/src/anchor/runtime.ts
import type { Anchor, ThreadListItem, ThreadStatus } from '@airnauts/airside-core'
import type { ApiClient } from '../api/client'
import { mapRects, pinXY } from '../positioning/coords'
import type { PlacedThread } from '../threads/state'
import { rematch } from './rematch'

export type RuntimeOptions = {
  client: Pick<ApiClient, 'listThreads' | 'refreshAnchor'>
  pageKey: string
  onPlacements: (placements: PlacedThread[]) => void
  root?: ParentNode
  /**
   * Resolve the page key for the CURRENT document URL. Used to detect that a client-side
   * route change is in flight: when this no longer equals `pageKey`, this runtime is keyed
   * to the page being left and the live DOM already belongs to the destination route, so
   * rematching would falsely orphan our threads. Omitted in tests that don't exercise nav.
   */
  currentPageKey?: () => string
}

type RetainedMatch = { item: ThreadListItem; el: Element; anchor: Anchor; range?: Range }

function toPlacedThread(p: RetainedMatch): PlacedThread {
  const rect = p.el.getBoundingClientRect()
  // Recompute the selection highlight from the live range on every emit — mirroring the live
  // getBoundingClientRect() used for the pin — so the rects track the text under scroll/resize
  // instead of replaying the geometry captured once at match time.
  const highlight = p.range ? mapRects(Array.from(p.range.getClientRects())) : []
  return { item: p.item, pin: pinXY(rect, p.anchor.offset), highlight }
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
      console.debug('[airside] anchor lost', {
        threadId: item.id,
        pageKey: opts.pageKey,
        reason: res.reason,
        ...res.diagnostics,
      })
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
    } else if (item.anchorState === 'orphaned') {
      // Clean fast-path re-anchor (no heal payload) of a thread the server still has flagged
      // orphaned — e.g. a transient orphan written during an SPA route transition. Without this
      // write-back the comment renders fine but the stored flag never clears, so the API and the
      // cross-page panel keep showing it as anchor-lost. Patch the retained item to 'anchored'
      // below so repeated rematches don't re-POST.
      void opts.client.refreshAnchor(item.id, { anchorState: 'anchored' }).catch(() => {})
    }
    // Retain the matched Range (not the rects it currently yields): toPlacedThread recomputes
    // the highlight from it on each emit so it tracks live geometry like the pin does.
    const range = res.kind === 'anchored' ? res.range : undefined
    const nextItem: ThreadListItem =
      item.anchorState === 'orphaned' ? { ...item, anchorState: 'anchored' } : item
    return { item: nextItem, el: res.el, anchor: nextAnchor, range }
  }

  const resizeObs = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => emit()) : null

  function observeWinners() {
    resizeObs?.disconnect()
    for (const p of placed) resizeObs?.observe(p.el)
  }

  async function refresh() {
    const { threads } = await opts.client.listThreads({ pageKey: opts.pageKey })
    placed = threads
      // Page-level (unanchored) threads carry no anchor and opt out of matching entirely — never
      // placed, never rematched, never orphan-reported. Skip them before matchAndReport so it can't
      // receive an undefined anchor (which would crash rematch) or POST a spurious refreshAnchor.
      .flatMap((t) => (t.anchor ? [matchAndReport(t, t.anchor)] : []))
      .filter((p): p is RetainedMatch => p !== null)
    observeWinners()
    emit()
  }

  function rematchAll() {
    // Bail if a client-side route change is in flight: the URL has already moved to another
    // page, so the live DOM belongs to the destination route, not opts.pageKey. Mutations from
    // the host swapping page content would otherwise make our retained threads miss and get
    // persisted `orphaned` — patching anchors for the page we're leaving. The re-keyed runtime
    // (created on the route change) matches the destination page's threads instead.
    if (opts.currentPageKey && opts.currentPageKey() !== opts.pageKey) return
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

  // Patch a cached item's comment count so subsequent emits carry the optimistic reply count
  // instead of clobbering it back to the listed value — same reason as setItemStatus.
  function bumpCommentCount(id: string, delta: number) {
    let changed = false
    placed = placed.map((p) => {
      if (p.item.id !== id) return p
      changed = true
      return { ...p, item: { ...p.item, commentCount: Math.max(0, p.item.commentCount + delta) } }
    })
    if (changed) emit()
  }

  // Drop a thread from the retained set so the next reposition/rematch emit can't resurrect
  // a pin for a thread the controller has optimistically deleted (before the server round-trip).
  function removeItem(id: string) {
    const next = placed.filter((p) => p.item.id !== id)
    if (next.length === placed.length) return
    placed = next
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
    setItemStatus,
    bumpCommentCount,
    removeItem,
    dispose,
    get placed() {
      return placed
    },
  }
}
