import { ANCHOR_SCHEMA_VERSION, type Anchor, type ThreadListItem } from '@airnauts/airside-core'
import { describe, expect, it, vi } from 'vitest'
import { mockRect } from '../../test/test-helpers/dom'
import { extractSignals } from './extract'
import { createRuntime } from './runtime'
import { buildSelectors } from './selectors'

const anchorFor = (sel: string): Anchor => {
  const el = document.querySelector(sel) as Element
  return {
    schemaVersion: ANCHOR_SCHEMA_VERSION,
    selectors: buildSelectors(el),
    signals: extractSignals(el),
    offset: { fx: 0.5, fy: 0.5 },
  }
}

const li = (
  id: string,
  anchor: Anchor,
  anchorState: 'anchored' | 'orphaned' = 'anchored',
): ThreadListItem =>
  ({
    id,
    status: 'open',
    anchorState,
    unresolvedCount: 1,
    commentCount: 1,
    createdBy: { email: 'a@b.c' },
    anchor,
  }) as unknown as ThreadListItem

function fakeClient(threads: ThreadListItem[]) {
  return {
    listThreads: vi.fn().mockResolvedValue({ threads, nextCursor: null }),
    refreshAnchor: vi.fn().mockResolvedValue({}),
  }
}

describe('createRuntime.refresh', () => {
  it('places anchored threads and emits placements', async () => {
    document.body.innerHTML = '<main><p id="t" class="lead">hello world</p></main>'
    mockRect(document.querySelector('#t') as Element, { left: 0, top: 0, width: 100, height: 20 })
    const client = fakeClient([li('th1', anchorFor('#t'))])
    const onPlacements = vi.fn()
    const rt = createRuntime({ client: client as never, pageKey: 'k', onPlacements })
    await rt.refresh()
    const last = onPlacements.mock.calls.at(-1)?.[0]
    expect(last).toHaveLength(1)
    expect(last[0].item.id).toBe('th1')
  })

  it('reports orphans via refreshAnchor and drops them from placements', async () => {
    document.body.innerHTML = '<main><span>nothing matches</span></main>'
    const orphanAnchor: Anchor = {
      schemaVersion: ANCHOR_SCHEMA_VERSION,
      selectors: ['#gone', '#gone'],
      signals: {
        tag: 'p',
        classes: ['lead'],
        siblingIndex: 0,
        ancestorTrail: ['main'],
        textSnippet: 'unique gone text',
      },
      offset: { fx: 0.5, fy: 0.5 },
    }
    const client = fakeClient([li('th2', orphanAnchor)])
    const onPlacements = vi.fn()
    const rt = createRuntime({ client: client as never, pageKey: 'k', onPlacements })
    await rt.refresh()
    expect(client.refreshAnchor).toHaveBeenCalledWith('th2', { anchorState: 'orphaned' })
    expect(onPlacements.mock.calls.at(-1)?.[0]).toHaveLength(0)
  })

  it('skips a page-level (unanchored) thread: never placed, never refreshAnchor', async () => {
    document.body.innerHTML = '<main><p id="t">hello</p></main>'
    const pageItem = {
      id: 'page1',
      status: 'open',
      anchorState: 'unanchored',
      unresolvedCount: 1,
      commentCount: 1,
      createdBy: { email: 'a@b.c' },
      // no `anchor` — a page comment opts out of the anchoring machinery entirely
    } as unknown as ThreadListItem
    const client = fakeClient([pageItem])
    const onPlacements = vi.fn()
    const rt = createRuntime({ client: client as never, pageKey: 'k', onPlacements })
    await rt.refresh()
    // Not placed, and — crucially — matchAndReport never ran, so no rematch crash and no orphan POST.
    expect(onPlacements.mock.calls.at(-1)?.[0]).toHaveLength(0)
    expect(client.refreshAnchor).not.toHaveBeenCalled()
    expect(rt.placed).toHaveLength(0)
  })

  it('self-heals a drifted match via refreshAnchor(anchored, fresh fingerprint)', async () => {
    // Build the stored anchor from the BEFORE dom, then mutate document to AFTER: a wrapper div + class
    // rename make BOTH fast-path selectors miss, while data-foo survives so scoring re-finds it -> heal.
    document.body.innerHTML =
      '<section><p class="lead" data-foo="bar">unique alpha beta gamma delta</p></section>'
    const stored = anchorFor('p')
    document.body.innerHTML =
      '<section><div class="wrap"><p class="renamed" data-foo="bar">unique alpha beta gamma delta</p></div></section>'
    mockRect(document.querySelector('p') as Element, { left: 0, top: 0, width: 50, height: 10 })
    const client = fakeClient([li('th3', stored)])
    const rt = createRuntime({ client: client as never, pageKey: 'k', onPlacements: vi.fn() })
    await rt.refresh()
    expect(client.refreshAnchor).toHaveBeenCalledWith(
      'th3',
      expect.objectContaining({ anchorState: 'anchored' }),
    )
  })

  it('clears a stale orphaned flag when a clean (fast-path) re-anchor succeeds', async () => {
    // The thread re-anchors cleanly via the fast path (unique selector + agreeing signals),
    // so there is no heal payload. But the server still has it flagged orphaned (e.g. a
    // transient orphan written during SPA navigation). The runtime must write back anchored
    // so the stale flag clears — otherwise the comment renders fine but the API/panel keep
    // showing it as anchor-lost forever.
    document.body.innerHTML = '<main><p id="stale" class="lead">hello world</p></main>'
    mockRect(document.querySelector('#stale') as Element, {
      left: 0,
      top: 0,
      width: 100,
      height: 20,
    })
    const client = fakeClient([li('thstale', anchorFor('#stale'), 'orphaned')])
    const onPlacements = vi.fn()
    const rt = createRuntime({ client: client as never, pageKey: 'k', onPlacements })
    await rt.refresh()
    expect(client.refreshAnchor).toHaveBeenCalledWith('thstale', { anchorState: 'anchored' })
    // and it is placed like any anchored thread
    expect(onPlacements.mock.calls.at(-1)?.[0]).toHaveLength(1)
  })

  it('does not re-post when an already-anchored thread re-anchors cleanly', async () => {
    document.body.innerHTML = '<main><p id="ok2" class="lead">hello world</p></main>'
    mockRect(document.querySelector('#ok2') as Element, { left: 0, top: 0, width: 100, height: 20 })
    const client = fakeClient([li('thok', anchorFor('#ok2'))])
    const rt = createRuntime({ client: client as never, pageKey: 'k', onPlacements: vi.fn() })
    await rt.refresh()
    expect(client.refreshAnchor).not.toHaveBeenCalled()
  })

  it('clears a stale orphaned flag only once across repeated rematches', async () => {
    document.body.innerHTML = '<main><p id="once" class="lead">hello world</p></main>'
    mockRect(document.querySelector('#once') as Element, {
      left: 0,
      top: 0,
      width: 100,
      height: 20,
    })
    const client = fakeClient([li('thonce', anchorFor('#once'), 'orphaned')])
    const rt = createRuntime({ client: client as never, pageKey: 'k', onPlacements: vi.fn() })
    await rt.refresh()
    rt.rematchAll()
    rt.rematchAll()
    const anchoredCalls = client.refreshAnchor.mock.calls.filter(
      ([, body]) => body.anchorState === 'anchored',
    )
    expect(anchoredCalls).toHaveLength(1)
  })

  it('reports selectionLost via refreshAnchor and keeps the element pin', async () => {
    document.body.innerHTML = '<article id="a"><p>Entirely different content now.</p></article>'
    mockRect(document.querySelector('#a') as Element, { left: 0, top: 0, width: 100, height: 20 })
    const anchor = anchorFor('#a')
    anchor.selection = {
      start: { selectors: ['p', 'p'], textNodeIndex: 0, offset: 0 },
      end: { selectors: ['p', 'p'], textNodeIndex: 0, offset: 0 },
      quote: 'missing quote',
      prefix: '',
      suffix: '',
    }
    const client = fakeClient([li('th4', anchor)])
    const onPlacements = vi.fn()
    const rt = createRuntime({ client: client as never, pageKey: 'k', onPlacements })
    await rt.refresh()
    expect(client.refreshAnchor).toHaveBeenCalledWith(
      'th4',
      expect.objectContaining({ anchorState: 'anchored', selectionLost: true }),
    )
    expect(onPlacements.mock.calls.at(-1)?.[0]).toHaveLength(1)
  })

  it('console.debug explains why a thread orphaned', async () => {
    document.body.innerHTML = '<main><span>nothing matches</span></main>'
    const orphanAnchor: Anchor = {
      schemaVersion: ANCHOR_SCHEMA_VERSION,
      selectors: ['#gone', '#gone'],
      signals: {
        tag: 'p',
        classes: ['lead'],
        siblingIndex: 0,
        ancestorTrail: ['main'],
        textSnippet: 'unique gone text',
      },
      offset: { fx: 0.5, fy: 0.5 },
    } as unknown as Anchor
    const debug = vi.spyOn(console, 'debug').mockImplementation(() => {})
    const client = fakeClient([li('thd', orphanAnchor)])
    const rt = createRuntime({ client: client as never, pageKey: 'k', onPlacements: vi.fn() })
    await rt.refresh()
    expect(debug).toHaveBeenCalledTimes(1)
    expect(debug).toHaveBeenCalledWith(
      '[airside] anchor lost',
      expect.objectContaining({
        threadId: 'thd',
        pageKey: 'k',
        reason: 'noCandidates',
        candidateCount: 0,
      }),
    )
    debug.mockRestore()
  })

  it('does not console.debug when a thread anchors successfully', async () => {
    document.body.innerHTML = '<main><p id="ok" class="lead">hello world</p></main>'
    mockRect(document.querySelector('#ok') as Element, { left: 0, top: 0, width: 100, height: 20 })
    const debug = vi.spyOn(console, 'debug').mockImplementation(() => {})
    const client = fakeClient([li('tha', anchorFor('#ok'))])
    const rt = createRuntime({ client: client as never, pageKey: 'k', onPlacements: vi.fn() })
    await rt.refresh()
    expect(debug).not.toHaveBeenCalled()
    debug.mockRestore()
  })

  it('selectionLost WITH heal sends the healed fingerprint', async () => {
    // Build the stored anchor from the BEFORE dom (same text as the heal test so scoring works).
    // The wrapper+rename makes both fast-path selectors miss; data-foo survives so scoring re-finds it.
    // The selection.quote is not present in the new text -> selectionLost + healed together.
    document.body.innerHTML =
      '<section><p class="lead" data-foo="bar">unique alpha beta gamma delta</p></section>'
    const stored = anchorFor('p')
    stored.selection = {
      start: { selectors: ['p', 'p'], textNodeIndex: 0, offset: 0 },
      end: { selectors: ['p', 'p'], textNodeIndex: 0, offset: 0 },
      quote: 'phrase that does not appear anywhere',
      prefix: '',
      suffix: '',
    }
    document.body.innerHTML =
      '<section><div class="wrap"><p class="renamed" data-foo="bar">unique alpha beta gamma delta</p></div></section>'
    mockRect(document.querySelector('p') as Element, { left: 0, top: 0, width: 50, height: 10 })
    const client = fakeClient([li('th5', stored)])
    const rt = createRuntime({ client: client as never, pageKey: 'k', onPlacements: vi.fn() })
    await rt.refresh()
    expect(client.refreshAnchor).toHaveBeenCalledWith(
      'th5',
      expect.objectContaining({
        anchorState: 'anchored',
        selectionLost: true,
        selectors: expect.anything(),
        signals: expect.anything(),
      }),
    )
  })
})

describe('createRuntime.rematchAll', () => {
  it('re-matches retained anchors and orphans dropped elements on DOM mutation', async () => {
    document.body.innerHTML = '<main><p id="rm1" class="lead">rematch target text</p></main>'
    mockRect(document.querySelector('#rm1') as Element, { left: 0, top: 0, width: 100, height: 20 })
    const anchor = anchorFor('#rm1')
    const client = fakeClient([li('thrm', anchor)])
    const onPlacements = vi.fn()
    const rt = createRuntime({ client: client as never, pageKey: 'k', onPlacements })
    await rt.refresh()
    // confirm it was placed
    expect(rt.placed).toHaveLength(1)
    // Mutate DOM: remove the element entirely so rematch will orphan it
    document.body.innerHTML = '<main><span>something else</span></main>'
    rt.rematchAll()
    // Should report orphaned
    expect(client.refreshAnchor).toHaveBeenCalledWith('thrm', { anchorState: 'orphaned' })
    // placed should now be empty and onPlacements called with []
    expect(rt.placed).toHaveLength(0)
    expect(onPlacements.mock.calls.at(-1)?.[0]).toHaveLength(0)
  })

  it('skips rematch (and does not orphan) once the URL has navigated to another page', async () => {
    // Reproduces the SPA-navigation false orphan: during a client-side route change the host
    // swaps page content, firing the MutationObserver while THIS runtime (keyed to the page being
    // left) is still mounted. Matching its threads against the destination DOM would falsely orphan
    // and persist them. The runtime must detect the URL has already moved on and bail.
    document.body.innerHTML = '<main><p id="leaving" class="lead">on page A</p></main>'
    mockRect(document.querySelector('#leaving') as Element, {
      left: 0,
      top: 0,
      width: 100,
      height: 20,
    })
    let currentKey = 'A'
    const client = fakeClient([li('thnav', anchorFor('#leaving'))])
    const onPlacements = vi.fn()
    const rt = createRuntime({
      client: client as never,
      pageKey: 'A',
      currentPageKey: () => currentKey,
      onPlacements,
    })
    await rt.refresh()
    expect(rt.placed).toHaveLength(1)
    // Client-side nav to page B: the URL/pageKey changes and the DOM swaps to B's content.
    currentKey = 'B'
    document.body.innerHTML = '<main><span>page B content</span></main>'
    rt.rematchAll()
    // The page-A thread must NOT be orphaned against page-B's DOM, and must stay retained.
    expect(client.refreshAnchor).not.toHaveBeenCalled()
    expect(rt.placed).toHaveLength(1)
  })

  it('still rematches on same-page DOM mutation when currentPageKey matches', async () => {
    document.body.innerHTML = '<main><p id="same" class="lead">same page text</p></main>'
    mockRect(document.querySelector('#same') as Element, {
      left: 0,
      top: 0,
      width: 100,
      height: 20,
    })
    const client = fakeClient([li('thsame', anchorFor('#same'))])
    const rt = createRuntime({
      client: client as never,
      pageKey: 'A',
      currentPageKey: () => 'A',
      onPlacements: vi.fn(),
    })
    await rt.refresh()
    // Genuine in-page removal: the element is gone while still on page A -> orphan as before.
    document.body.innerHTML = '<main><span>something else</span></main>'
    rt.rematchAll()
    expect(client.refreshAnchor).toHaveBeenCalledWith('thsame', { anchorState: 'orphaned' })
  })
})

describe('createRuntime.reposition', () => {
  it('recomputes selection highlight rects from the live range on each reposition emit', async () => {
    document.body.innerHTML = '<main><p id="hl">unique alpha beta gamma delta</p></main>'
    mockRect(document.querySelector('#hl') as Element, { left: 0, top: 0, width: 100, height: 20 })
    const anchor = anchorFor('#hl')
    anchor.selection = {
      start: { selectors: ['p', 'p'], textNodeIndex: 0, offset: 0 },
      end: { selectors: ['p', 'p'], textNodeIndex: 0, offset: 0 },
      quote: 'alpha beta',
      prefix: '',
      suffix: '',
    }
    // Drive the matched Range's getClientRects() from a mutable rect so a "scroll" moves the
    // highlighted text in the viewport. The pin already tracks live geometry; the highlight must too.
    let rangeRect = { left: 10, top: 10, width: 40, height: 16 }
    const origGetClientRects = Range.prototype.getClientRects
    Range.prototype.getClientRects = () =>
      [
        {
          ...rangeRect,
          x: rangeRect.left,
          y: rangeRect.top,
          right: rangeRect.left + rangeRect.width,
          bottom: rangeRect.top + rangeRect.height,
          toJSON: () => ({}),
        },
      ] as unknown as DOMRectList
    try {
      const client = fakeClient([li('thhl', anchor)])
      const onPlacements = vi.fn()
      const rt = createRuntime({ client: client as never, pageKey: 'k', onPlacements })
      await rt.refresh()
      // A range was matched, so the initial highlight reflects the matched rect (not []).
      expect(onPlacements.mock.calls.at(-1)?.[0][0].highlight).toEqual([
        { x: 10, y: 10, width: 40, height: 16 },
      ])
      // Simulate a scroll: the text moves up 30px in viewport coords. A bare reposition emit
      // (no rematch) must re-read the live range, not replay the rect captured at match time.
      rangeRect = { left: 10, top: -20, width: 40, height: 16 }
      rt.reposition()
      expect(onPlacements.mock.calls.at(-1)?.[0][0].highlight).toEqual([
        { x: 10, y: -20, width: 40, height: 16 },
      ])
    } finally {
      Range.prototype.getClientRects = origGetClientRects
    }
  })
})

describe('createRuntime.bumpCommentCount', () => {
  it('patches the cached item count so the next emit carries the optimistic reply', async () => {
    document.body.innerHTML = '<main><p id="bc" class="lead">bump count target</p></main>'
    mockRect(document.querySelector('#bc') as Element, { left: 0, top: 0, width: 100, height: 20 })
    const client = fakeClient([li('thbc', anchorFor('#bc'))])
    const onPlacements = vi.fn()
    const rt = createRuntime({ client: client as never, pageKey: 'k', onPlacements })
    await rt.refresh()
    expect(onPlacements.mock.calls.at(-1)?.[0][0].item.commentCount).toBe(1)
    rt.bumpCommentCount('thbc', 1)
    expect(onPlacements.mock.calls.at(-1)?.[0][0].item.commentCount).toBe(2)
    // a subsequent reposition re-emit still carries the bumped count (not the listed 1)
    rt.reposition()
    expect(onPlacements.mock.calls.at(-1)?.[0][0].item.commentCount).toBe(2)
  })

  it('clamps at zero and is a no-op (no emit) for an unknown id', async () => {
    document.body.innerHTML = '<main><p id="bc2" class="lead">bump count target two</p></main>'
    mockRect(document.querySelector('#bc2') as Element, { left: 0, top: 0, width: 100, height: 20 })
    const client = fakeClient([li('thbc2', anchorFor('#bc2'))])
    const onPlacements = vi.fn()
    const rt = createRuntime({ client: client as never, pageKey: 'k', onPlacements })
    await rt.refresh()
    const callsBefore = onPlacements.mock.calls.length
    rt.bumpCommentCount('nope', 1)
    expect(onPlacements.mock.calls.length).toBe(callsBefore)
    rt.bumpCommentCount('thbc2', -5)
    expect(onPlacements.mock.calls.at(-1)?.[0][0].item.commentCount).toBe(0)
  })
})
