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
    // image-only comment (blank text + an attachment) is allowed
    expect(
      CreateThreadBody.parse({ ...body, comment: { text: '', attachmentIds: ['at_1'] } }).comment
        .attachmentIds,
    ).toEqual(['at_1'])
  })
  it('CreateThreadBody rejects non-http(s) pageUrl schemes', () => {
    const body = {
      anchor,
      comment: { text: 'hi' },
      author: { email: 'a@b.com' },
      captureContext: { viewportW: 1, viewportH: 1, devicePixelRatio: 1, userAgent: 'x' },
    }
    expect(CreateThreadBody.parse({ ...body, pageUrl: 'http://x.com/a' }).pageUrl).toBe(
      'http://x.com/a',
    )
    // a deep-link is built from pageUrl server-side, so an active scheme must never get in
    expect(() => CreateThreadBody.parse({ ...body, pageUrl: 'javascript:alert(1)' })).toThrow()
    expect(() => CreateThreadBody.parse({ ...body, pageUrl: 'data:text/html,x' })).toThrow()
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
    // image-only reply is allowed; content-less reply (no text, no attachment) is rejected
    expect(
      AddCommentBody.parse({ text: '', attachmentIds: ['at_1'], author: { email: 'a@b.com' } })
        .attachmentIds,
    ).toEqual(['at_1'])
    expect(() => AddCommentBody.parse({ text: '   ', author: { email: 'a@b.com' } })).toThrow()
    expect(SetThreadStatusBody.parse({ status: 'resolved' }).status).toBe('resolved')
    expect(RefreshAnchorBody.parse({ anchorState: 'orphaned' }).anchorState).toBe('orphaned')
  })
})

describe('response schemas', () => {
  it('ThreadListResponse envelopes items + nullable cursor', () => {
    expect(ThreadListResponse.parse({ threads: [], nextCursor: null }).nextCursor).toBeNull()
  })
})
