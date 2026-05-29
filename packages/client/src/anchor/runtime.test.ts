import { ANCHOR_SCHEMA_VERSION, type Anchor } from '@comments/core'
import { describe, expect, it, vi } from 'vitest'
import { mockRect } from '../../test/test-helpers/dom'
import { extractSignals } from './extract'
import { buildSelectors } from './selectors'
import { createRuntime } from './runtime'

const anchorFor = (sel: string): Anchor => {
  const el = document.querySelector(sel) as Element
  return { schemaVersion: ANCHOR_SCHEMA_VERSION, selectors: buildSelectors(el), signals: extractSignals(el), offset: { fx: 0.5, fy: 0.5 } }
}

function fakeClient(threads: Array<{ id: string; anchor: Anchor }>) {
  return {
    listThreads: vi.fn().mockResolvedValue({ threads, nextCursor: null }),
    refreshAnchor: vi.fn().mockResolvedValue({}),
  }
}

describe('createRuntime.refresh', () => {
  it('places anchored threads and emits placements', async () => {
    document.body.innerHTML = '<main><p id="t" class="lead">hello world</p></main>'
    mockRect(document.querySelector('#t') as Element, { left: 0, top: 0, width: 100, height: 20 })
    const client = fakeClient([{ id: 'th1', anchor: anchorFor('#t') }])
    const onPlacements = vi.fn()
    const rt = createRuntime({ client: client as never, pageKey: 'k', onPlacements })
    await rt.refresh()
    const last = onPlacements.mock.calls.at(-1)?.[0]
    expect(last).toHaveLength(1)
    expect(last[0].id).toBe('th1')
  })

  it('reports orphans via refreshAnchor and drops them from placements', async () => {
    document.body.innerHTML = '<main><span>nothing matches</span></main>'
    const orphanAnchor: Anchor = {
      schemaVersion: ANCHOR_SCHEMA_VERSION,
      selectors: ['#gone', '#gone'],
      signals: { tag: 'p', classes: ['lead'], siblingIndex: 0, ancestorTrail: ['main'], textSnippet: 'unique gone text' },
      offset: { fx: 0.5, fy: 0.5 },
    }
    const client = fakeClient([{ id: 'th2', anchor: orphanAnchor }])
    const onPlacements = vi.fn()
    const rt = createRuntime({ client: client as never, pageKey: 'k', onPlacements })
    await rt.refresh()
    expect(client.refreshAnchor).toHaveBeenCalledWith('th2', { anchorState: 'orphaned' })
    expect(onPlacements.mock.calls.at(-1)?.[0]).toHaveLength(0)
  })

  it('self-heals a drifted match via refreshAnchor(anchored, fresh fingerprint)', async () => {
    // Build the stored anchor from the BEFORE dom, then mutate document to AFTER: a wrapper div + class
    // rename make BOTH fast-path selectors miss, while data-foo survives so scoring re-finds it -> heal.
    document.body.innerHTML = '<section><p class="lead" data-foo="bar">unique alpha beta gamma delta</p></section>'
    const stored = anchorFor('p')
    document.body.innerHTML = '<section><div class="wrap"><p class="renamed" data-foo="bar">unique alpha beta gamma delta</p></div></section>'
    mockRect(document.querySelector('p') as Element, { left: 0, top: 0, width: 50, height: 10 })
    const client = fakeClient([{ id: 'th3', anchor: stored }])
    const rt = createRuntime({ client: client as never, pageKey: 'k', onPlacements: vi.fn() })
    await rt.refresh()
    expect(client.refreshAnchor).toHaveBeenCalledWith('th3', expect.objectContaining({ anchorState: 'anchored' }))
  })

  it('reports selectionLost via refreshAnchor and keeps the element pin', async () => {
    document.body.innerHTML = '<article id="a"><p>Entirely different content now.</p></article>'
    mockRect(document.querySelector('#a') as Element, { left: 0, top: 0, width: 100, height: 20 })
    const anchor = anchorFor('#a')
    anchor.selection = { start: { selectors: ['p', 'p'], textNodeIndex: 0, offset: 0 }, end: { selectors: ['p', 'p'], textNodeIndex: 0, offset: 0 }, quote: 'missing quote', prefix: '', suffix: '' }
    const client = fakeClient([{ id: 'th4', anchor }])
    const onPlacements = vi.fn()
    const rt = createRuntime({ client: client as never, pageKey: 'k', onPlacements })
    await rt.refresh()
    expect(client.refreshAnchor).toHaveBeenCalledWith('th4', expect.objectContaining({ anchorState: 'anchored', selectionLost: true }))
    expect(onPlacements.mock.calls.at(-1)?.[0]).toHaveLength(1)
  })
})
