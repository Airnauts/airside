// packages/client/src/threads/state.test.ts
import type { Comment, Thread, ThreadListItem } from '@comments/core'
import { describe, expect, it } from 'vitest'
import { initialState, reducer, visiblePlacements } from './state'
import type { PlacedThread } from './state'

const item = (id: string, status: 'open' | 'resolved' = 'open'): ThreadListItem =>
  ({
    id,
    status,
    anchorState: 'anchored',
    unresolvedCount: status === 'open' ? 1 : 0,
    commentCount: 1,
    createdBy: { email: 'a@b.c', name: 'Ann' },
    anchor: { offset: { fx: 0.5, fy: 0.5 } },
  }) as unknown as ThreadListItem

const placed = (id: string, status: 'open' | 'resolved' = 'open'): PlacedThread => ({
  item: item(id, status),
  pin: { x: 10, y: 20 },
  highlight: [],
})

const thread = (id: string): Thread =>
  ({ id, status: 'open', comments: [] }) as unknown as Thread

const comment = (id: string): Comment =>
  ({ id, author: { email: 'a@b.c' }, text: 'hi', attachments: [], createdAt: 'x' }) as unknown as Comment

describe('threads reducer', () => {
  it('INGEST_PLACEMENTS populates items/placements/order', () => {
    const s = reducer(initialState, { type: 'INGEST_PLACEMENTS', placements: [placed('a'), placed('b')] })
    expect(s.order).toEqual(['a', 'b'])
    expect(s.itemsById.a.id).toBe('a')
    expect(s.placementsById.b.pin).toEqual({ x: 10, y: 20 })
  })

  it('INGEST_PLACEMENTS preserves openId, detail, and draft', () => {
    let s = reducer(initialState, { type: 'INGEST_PLACEMENTS', placements: [placed('a')] })
    s = reducer(s, { type: 'OPEN', id: 'a' })
    s = reducer(s, { type: 'DETAIL_LOADED', id: 'a', thread: thread('a') })
    const next = reducer(s, { type: 'INGEST_PLACEMENTS', placements: [placed('a')] })
    expect(next.openId).toBe('a')
    expect(next.detailById.a).toBeDefined()
  })

  it('INGEST_PLACEMENTS clears openId and records lostOpenId when the open thread orphans away', () => {
    let s = reducer(initialState, { type: 'INGEST_PLACEMENTS', placements: [placed('a')] })
    s = reducer(s, { type: 'OPEN', id: 'a' })
    const next = reducer(s, { type: 'INGEST_PLACEMENTS', placements: [placed('b')] })
    expect(next.openId).toBeNull()
    expect(next.lostOpenId).toBe('a')
  })

  it('OPEN clears any draft and sets openId', () => {
    let s = reducer(initialState, {
      type: 'SET_DRAFT',
      draft: { anchor: {} as never, point: { x: 1, y: 2 }, pin: { x: 1, y: 2 } },
    })
    expect(s.draft).not.toBeNull()
    s = reducer(s, { type: 'OPEN', id: 'a' })
    expect(s.draft).toBeNull()
    expect(s.openId).toBe('a')
  })

  it('SET_DRAFT closes any open thread; CLEAR_DRAFT removes it', () => {
    let s = reducer({ ...initialState, openId: 'a' }, {
      type: 'SET_DRAFT',
      draft: { anchor: {} as never, point: { x: 0, y: 0 }, pin: { x: 0, y: 0 } },
    })
    expect(s.openId).toBeNull()
    s = reducer(s, { type: 'CLEAR_DRAFT' })
    expect(s.draft).toBeNull()
  })

  it('detail lifecycle: loading -> loaded clears loading/error', () => {
    let s = reducer(initialState, { type: 'DETAIL_LOADING', id: 'a' })
    expect(s.loadingDetail.a).toBe(true)
    s = reducer(s, { type: 'DETAIL_LOADED', id: 'a', thread: thread('a') })
    expect(s.loadingDetail.a).toBeUndefined()
    expect(s.detailById.a.id).toBe('a')
  })

  it('optimistic comment add / replace / remove', () => {
    let s = reducer(initialState, { type: 'DETAIL_LOADED', id: 'a', thread: thread('a') })
    s = reducer(s, { type: 'ADD_OPTIMISTIC_COMMENT', id: 'a', comment: comment('temp-1') })
    expect(s.detailById.a.comments.map((c) => c.id)).toEqual(['temp-1'])
    s = reducer(s, { type: 'REPLACE_OPTIMISTIC_COMMENT', id: 'a', tempId: 'temp-1', comment: comment('real-1') })
    expect(s.detailById.a.comments.map((c) => c.id)).toEqual(['real-1'])
    s = reducer(s, { type: 'ADD_OPTIMISTIC_COMMENT', id: 'a', comment: comment('temp-2') })
    s = reducer(s, { type: 'REMOVE_OPTIMISTIC_COMMENT', id: 'a', tempId: 'temp-2' })
    expect(s.detailById.a.comments.map((c) => c.id)).toEqual(['real-1'])
  })

  it('SET_STATUS updates both the list item and the detail', () => {
    let s = reducer(initialState, { type: 'INGEST_PLACEMENTS', placements: [placed('a')] })
    s = reducer(s, { type: 'DETAIL_LOADED', id: 'a', thread: thread('a') })
    s = reducer(s, { type: 'SET_STATUS', id: 'a', status: 'resolved' })
    expect(s.itemsById.a.status).toBe('resolved')
    expect(s.detailById.a.status).toBe('resolved')
  })

  it('SET_SHOW_RESOLVED toggles the flag', () => {
    const s = reducer(initialState, { type: 'SET_SHOW_RESOLVED', value: true })
    expect(s.showResolved).toBe(true)
  })
})

describe('visiblePlacements selector', () => {
  it('hides resolved by default and reveals them when showResolved', () => {
    const base = reducer(initialState, {
      type: 'INGEST_PLACEMENTS',
      placements: [placed('a', 'open'), placed('b', 'resolved')],
    })
    expect(visiblePlacements(base).map((p) => p.item.id)).toEqual(['a'])
    expect(visiblePlacements({ ...base, showResolved: true }).map((p) => p.item.id)).toEqual(['a', 'b'])
  })
})
