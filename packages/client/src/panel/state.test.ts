// packages/client/src/panel/state.test.ts
import type { ThreadListItem } from '@comments/core'
import { describe, expect, it } from 'vitest'
import { initialState, mainListExcludingReview, reducer } from './state'

const item = (id: string, over: Partial<ThreadListItem> = {}): ThreadListItem =>
  ({ id, status: 'open', anchorState: 'anchored', unresolvedCount: 1 }) as ThreadListItem &
    typeof over

describe('panel reducer', () => {
  it('defaults to a closed drawer filtered to open', () => {
    expect(initialState.open).toBe(false)
    expect(initialState.filter).toBe('open')
  })

  it('OPEN/CLOSE toggle visibility without touching the list', () => {
    const open = reducer({ ...initialState, list: [item('a')] }, { type: 'OPEN' })
    expect(open.open).toBe(true)
    expect(open.list).toHaveLength(1)
    expect(reducer(open, { type: 'CLOSE' }).open).toBe(false)
  })

  it('SET_FILTER changes filter and resets the page', () => {
    const next = reducer(
      { ...initialState, list: [item('a')], nextCursor: 'c1' },
      { type: 'SET_FILTER', filter: 'resolved' },
    )
    expect(next.filter).toBe('resolved')
    expect(next.list).toEqual([])
    expect(next.nextCursor).toBeNull()
  })

  it('LOAD_SUCCESS replaces list + cursor + needsReview and clears loading/error', () => {
    const next = reducer(
      { ...initialState, loading: true, error: true },
      { type: 'LOAD_SUCCESS', list: [item('a')], nextCursor: 'c2', needsReview: [item('b')] },
    )
    expect(next.list.map((t) => t.id)).toEqual(['a'])
    expect(next.nextCursor).toBe('c2')
    expect(next.needsReview.map((t) => t.id)).toEqual(['b'])
    expect(next.loading).toBe(false)
    expect(next.error).toBe(false)
  })

  it('LOAD_MORE_SUCCESS appends to the existing list', () => {
    const next = reducer(
      { ...initialState, list: [item('a')], loadingMore: true },
      { type: 'LOAD_MORE_SUCCESS', list: [item('b')], nextCursor: null },
    )
    expect(next.list.map((t) => t.id)).toEqual(['a', 'b'])
    expect(next.nextCursor).toBeNull()
    expect(next.loadingMore).toBe(false)
  })

  it('mainListExcludingReview drops ids already in needsReview', () => {
    const state = {
      ...initialState,
      list: [item('a'), item('b')],
      needsReview: [item('b')],
    }
    expect(mainListExcludingReview(state).map((t) => t.id)).toEqual(['a'])
  })
})
