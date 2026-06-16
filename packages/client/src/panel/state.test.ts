// packages/client/src/panel/state.test.ts
import type { ThreadListItem } from '@airnauts/airside-core'
import { describe, expect, it } from 'vitest'
import { initialState, mainListExcludingReview, reducer } from './state'

describe('detail view', () => {
  it('starts on the list view', () => {
    expect(initialState.view).toBe('list')
    expect(initialState.detailThreadId).toBeNull()
  })

  it('OPEN_DETAIL switches to detail for a thread', () => {
    const s = reducer(initialState, { type: 'OPEN_DETAIL', id: 't1' })
    expect(s.view).toBe('detail')
    expect(s.detailThreadId).toBe('t1')
  })

  it('BACK returns to the list without dropping the loaded list', () => {
    const loaded = reducer(
      { ...initialState, list: [{ id: 'a' } as never], nextCursor: 'c1' },
      { type: 'OPEN_DETAIL', id: 'a' },
    )
    const s = reducer(loaded, { type: 'BACK' })
    expect(s.view).toBe('list')
    expect(s.detailThreadId).toBeNull()
    expect(s.list).toHaveLength(1)
    expect(s.nextCursor).toBe('c1')
  })

  it('CLOSE resets the view back to list', () => {
    const detail = reducer(initialState, { type: 'OPEN_DETAIL', id: 't1' })
    const s = reducer({ ...detail, open: true }, { type: 'CLOSE' })
    expect(s.open).toBe(false)
    expect(s.view).toBe('list')
    expect(s.detailThreadId).toBeNull()
  })
})

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

  it('BUMP_COMMENT_COUNT adjusts the matching row in list and needsReview, clamped at zero', () => {
    const withCount = (id: string, commentCount: number): ThreadListItem =>
      ({ ...item(id), commentCount }) as ThreadListItem
    let state = {
      ...initialState,
      list: [withCount('a', 2), withCount('b', 5)],
      needsReview: [withCount('b', 5)],
    }
    state = reducer(state, { type: 'BUMP_COMMENT_COUNT', id: 'b', delta: 1 })
    expect(state.list.map((t) => t.commentCount)).toEqual([2, 6])
    expect(state.needsReview[0].commentCount).toBe(6)
    state = reducer(state, { type: 'BUMP_COMMENT_COUNT', id: 'a', delta: -10 })
    expect(state.list[0].commentCount).toBe(0)
  })

  it('BUMP_COMMENT_COUNT leaves the list reference untouched for an unknown id', () => {
    const state = { ...initialState, list: [item('a')] }
    const next = reducer(state, { type: 'BUMP_COMMENT_COUNT', id: 'missing', delta: 1 })
    expect(next.list).toBe(state.list)
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
