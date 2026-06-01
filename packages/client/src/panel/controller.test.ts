// packages/client/src/panel/controller.test.ts
import type { ThreadListItem, ThreadListResponse } from '@comments/core'
import { describe, expect, it, vi } from 'vitest'
import { createPanelController } from './controller'
import { initialState, type PanelState, reducer } from './state'

const item = (id: string, over: Partial<ThreadListItem> = {}): ThreadListItem =>
  ({ id, status: 'open', anchorState: 'anchored', unresolvedCount: 1, ...over }) as ThreadListItem

function harness(listThreads: (p?: unknown) => Promise<ThreadListResponse>) {
  let state: PanelState = initialState
  const dispatch = (a: Parameters<typeof reducer>[1]) => {
    state = reducer(state, a)
  }
  const controller = createPanelController(dispatch, {
    client: { listThreads: listThreads as never },
    getState: () => state,
  })
  return { controller, get: () => state }
}

describe('panel controller', () => {
  it('openPanel fetches the main list (status=open) and the open-orphan review list', async () => {
    const listThreads = vi.fn(async (p: { status?: string; cursor?: string }) => {
      if (p.status === 'open' && !p.cursor)
        return { threads: [item('a'), item('orph', { anchorState: 'orphaned' })], nextCursor: 'c1' }
      return { threads: [], nextCursor: null }
    })
    const h = harness(listThreads as never)
    await h.controller.openPanel()
    expect(h.get().open).toBe(true)
    expect(listThreads).toHaveBeenCalledWith({ sort: 'updatedAt', status: 'open' })
    expect(listThreads).toHaveBeenCalledWith({ status: 'open' })
    expect(h.get().needsReview.map((t) => t.id)).toEqual(['orph'])
    expect(h.get().nextCursor).toBe('c1')
  })

  it('all filter omits status on the main fetch', async () => {
    const listThreads = vi.fn(async () => ({ threads: [], nextCursor: null }))
    const h = harness(listThreads as never)
    await h.controller.setFilter('all')
    expect(h.get().filter).toBe('all')
    expect(listThreads).toHaveBeenCalledWith({ sort: 'updatedAt' })
  })

  it('loadMore appends using the current cursor and is a no-op when cursor is null', async () => {
    const listThreads = vi.fn(async (p: { cursor?: string; status?: string }) => {
      if (p.status === 'open' && !p.cursor) return { threads: [item('a')], nextCursor: 'c1' }
      if (p.cursor === 'c1') return { threads: [item('b')], nextCursor: null }
      return { threads: [], nextCursor: null }
    })
    const h = harness(listThreads as never)
    await h.controller.openPanel()
    await h.controller.loadMore()
    expect(h.get().list.map((t) => t.id)).toEqual(['a', 'b'])
    listThreads.mockClear()
    await h.controller.loadMore() // cursor null now → no fetch
    expect(listThreads).not.toHaveBeenCalled()
  })

  it('sets error when the fetch rejects', async () => {
    const h = harness(
      vi.fn(async () => {
        throw new Error('net')
      }) as never,
    )
    await h.controller.openPanel()
    expect(h.get().error).toBe(true)
    expect(h.get().loading).toBe(false)
  })
})
