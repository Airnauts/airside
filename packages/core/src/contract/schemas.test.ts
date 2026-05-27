import { describe, expect, it } from 'vitest'
import {
  AddCommentBody,
  CreateThreadBody,
  ListThreadsQuery,
  RefreshAnchorBody,
  SetThreadStatusBody,
  ThreadIdParam,
} from './requests'
import { ThreadListResponse } from './responses'

const anchor = {
  schemaVersion: 1,
  selectors: ['body>div', 'body>div.flex'] as [string, string],
  signals: { tag: 'div', classes: [], siblingIndex: 0, ancestorTrail: [] },
  offset: { fx: 0, fy: 0 },
}

describe('request schemas', () => {
  it('CreateThreadBody requires anchor + first comment + author + capture', () => {
    const body = {
      pageUrl: 'https://x.com/a',
      anchor,
      comment: { text: 'hi' },
      author: { email: 'a@b.com' },
      captureContext: { viewportW: 1, viewportH: 1, devicePixelRatio: 1, userAgent: 'x' },
    }
    expect(CreateThreadBody.parse(body).comment.text).toBe('hi')
    expect(() => CreateThreadBody.parse({ ...body, comment: { text: '' } })).toThrow()
  })
  it('ListThreadsQuery accepts an empty query and a status filter', () => {
    expect(ListThreadsQuery.parse({})).toEqual({})
    expect(ListThreadsQuery.parse({ status: 'resolved', sort: 'updatedAt' }).status).toBe(
      'resolved',
    )
  })
  it('ThreadIdParam parses the id', () => {
    expect(ThreadIdParam.parse({ id: 't1' }).id).toBe('t1')
  })
  it('AddCommentBody / SetThreadStatusBody / RefreshAnchorBody parse', () => {
    expect(AddCommentBody.parse({ text: 'reply', author: { email: 'a@b.com' } }).text).toBe('reply')
    expect(SetThreadStatusBody.parse({ status: 'resolved' }).status).toBe('resolved')
    expect(RefreshAnchorBody.parse({ anchorState: 'orphaned' }).anchorState).toBe('orphaned')
  })
})

describe('response schemas', () => {
  it('ThreadListResponse envelopes items + nullable cursor', () => {
    expect(ThreadListResponse.parse({ threads: [], nextCursor: null }).nextCursor).toBeNull()
  })
})
