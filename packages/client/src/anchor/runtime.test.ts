import { ANCHOR_SCHEMA_VERSION, type Anchor, type ThreadListItem } from '@airnauts/comments-core'
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

const li = (id: string, anchor: Anchor): ThreadListItem =>
  ({
    id,
    status: 'open',
    anchorState: 'anchored',
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
      '[comments] anchor lost',
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
})
