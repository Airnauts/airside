import { describe, expect, it } from 'vitest'
import {
  Thread,
  ThreadListItem,
  ThreadListItemView,
  ThreadView,
  unresolvedCountOf,
} from './thread'

const base = {
  id: 't1',
  scope: 'page' as const,
  pageKey: 'https://x.com/a',
  pageUrl: 'https://x.com/a',
  anchor: {
    schemaVersion: 1,
    selectors: ['body>div', 'body>div.flex'] as [string, string],
    signals: { tag: 'div', classes: [], siblingIndex: 0, ancestorTrail: [] },
    offset: { fx: 0.1, fy: 0.2 },
  },
  status: 'open' as const,
  anchorState: 'anchored' as const,
  commentCount: 1,
  unresolvedCount: 1,
  createdBy: { email: 'a@b.com' },
  createdAt: '2026-05-27T11:47:26.611Z',
  updatedAt: '2026-05-27T11:47:26.611Z',
  lastActivityAt: '2026-05-27T11:47:26.611Z',
  schemaVersion: 1,
  rootComment: null,
}

describe('thread schemas', () => {
  it('ThreadListItem parses without comments and allows a null pageKey', () => {
    expect(ThreadListItem.parse(base).status).toBe('open')
    expect(ThreadListItem.parse({ ...base, pageKey: null }).pageKey).toBeNull()
  })
  it('Thread requires comments + captureContext', () => {
    const full = {
      ...base,
      comments: [],
      captureContext: { viewportW: 1, viewportH: 1, devicePixelRatio: 1, userAgent: 'x' },
    }
    expect(Thread.parse(full).comments).toEqual([])
    expect(() => Thread.parse(base)).toThrow()
  })
  it('rejects an unknown status', () => {
    expect(() => ThreadListItem.parse({ ...base, status: 'archived' })).toThrow()
  })
  it('ThreadListItem carries a nullable rootComment preview', () => {
    const withRoot = ThreadListItem.parse({
      ...base,
      rootComment: { text: 'hello', createdAt: '2026-05-28T10:00:00.000Z' },
    })
    expect(withRoot.rootComment).toEqual({
      text: 'hello',
      createdAt: '2026-05-28T10:00:00.000Z',
    })

    // empty text == attachment-only root; null == degenerate no-comment thread
    expect(
      ThreadListItem.parse({ ...base, rootComment: { text: '', createdAt: base.createdAt } })
        .rootComment?.text,
    ).toBe('')
    expect(ThreadListItem.parse({ ...base, rootComment: null }).rootComment).toBeNull()
  })
})

describe('externalLinks + view DTOs', () => {
  const baseFields = {
    id: 't1',
    scope: 'page' as const,
    pageKey: 'https://x.test/a',
    pageUrl: 'https://x.test/a',
    anchor: {
      schemaVersion: 1,
      selectors: ['body>div', 'body>div.flex'] as [string, string],
      signals: { tag: 'div', classes: [], siblingIndex: 0, ancestorTrail: [] },
      offset: { fx: 0.1, fy: 0.2 },
    },
    status: 'open' as const,
    anchorState: 'anchored' as const,
    commentCount: 1,
    unresolvedCount: 1,
    createdBy: { email: 'a@b.com' },
    createdAt: '2026-06-09T10:00:00.000Z',
    updatedAt: '2026-06-09T10:00:00.000Z',
    lastActivityAt: '2026-06-09T10:00:00.000Z',
    schemaVersion: 1,
  }

  const VALID_CAPTURE = { viewportW: 1, viewportH: 1, devicePixelRatio: 1, userAgent: 'x' }

  it('Thread accepts optional externalLinks', () => {
    const t = {
      ...baseFields,
      comments: [],
      captureContext: VALID_CAPTURE,
      externalLinks: [
        {
          provider: 'jira',
          externalId: '10042',
          key: 'WEB-123',
          label: 'Jira WEB-123',
          url: 'https://company.atlassian.net/browse/WEB-123',
          createdAt: '2026-06-09T10:00:00.000Z',
        },
      ],
    }
    expect(() => Thread.parse(t)).not.toThrow()
  })

  it('Thread is valid without externalLinks (optional)', () => {
    expect(() =>
      Thread.parse({ ...baseFields, comments: [], captureContext: VALID_CAPTURE }),
    ).not.toThrow()
  })

  it('ThreadView extends Thread with an actions array', () => {
    const view = {
      ...baseFields,
      comments: [],
      captureContext: VALID_CAPTURE,
      actions: [
        {
          id: 'jira.createIssue',
          provider: 'jira',
          label: 'Create Jira issue',
          slot: 'thread-toolbar',
        },
      ],
    }
    expect(() => ThreadView.parse(view)).not.toThrow()
  })

  it('Thread (storage shape) does NOT carry actions', () => {
    const parsed = Thread.parse({
      ...baseFields,
      comments: [],
      captureContext: VALID_CAPTURE,
      actions: [{ id: 'x', provider: 'p', label: 'L', slot: 'thread-toolbar' }],
    }) as Record<string, unknown>
    expect(parsed.actions).toBeUndefined()
  })

  it('ThreadListItemView extends ThreadListItem with actions and externalLinks', () => {
    const view = {
      ...baseFields,
      rootComment: { text: 'hi', createdAt: '2026-06-09T10:00:00.000Z' },
      externalLinks: [],
      actions: [],
    }
    expect(() => ThreadListItemView.parse(view)).not.toThrow()
  })
})

describe('unresolvedCountOf', () => {
  it('counts an open thread as 1 unresolved', () => {
    expect(unresolvedCountOf('open')).toBe(1)
  })

  it('counts a resolved thread as 0 unresolved', () => {
    expect(unresolvedCountOf('resolved')).toBe(0)
  })
})
