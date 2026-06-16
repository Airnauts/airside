import {
  ANCHOR_SCHEMA_VERSION,
  type Anchor,
  type Attachment,
  type AttachmentId,
  type Author,
  type CaptureContext,
  type Comment,
  type CommentId,
  type CreateThreadBody,
  type ThreadId,
} from '@airnauts/airside-core'
import type { NewComment, NewThread } from '@airnauts/airside-server'

// Counter is module-scoped — Vitest resets it per test file (one worker per file by default).
let counter = 0
const seq = () => `${++counter}`

export function makeAuthor(overrides: Partial<Author> = {}): Author {
  return { email: 'alice@example.com', name: 'Alice', ...overrides }
}

export function makeCaptureContext(overrides: Partial<CaptureContext> = {}): CaptureContext {
  return {
    viewportW: 1440,
    viewportH: 900,
    devicePixelRatio: 2,
    userAgent: 'Mozilla/5.0 (test)',
    ...overrides,
  }
}

export function makeAnchor(overrides: Partial<Anchor> = {}): Anchor {
  return {
    schemaVersion: ANCHOR_SCHEMA_VERSION,
    selectors: ['main > section:nth-of-type(1) > h1', '.hero > .title'],
    signals: {
      tag: 'h1',
      classes: ['title'],
      siblingIndex: 0,
      ancestorTrail: ['main', 'section.hero'],
    },
    offset: { fx: 0.5, fy: 0.5 },
    ...overrides,
  }
}

export function makeCreateThreadBody(overrides: Partial<CreateThreadBody> = {}): CreateThreadBody {
  return {
    pageKey: 'example.com/about',
    pageUrl: 'https://example.com/about',
    pageTitle: 'About',
    anchor: makeAnchor(),
    comment: { text: 'first comment' },
    author: makeAuthor(),
    captureContext: makeCaptureContext(),
    ...overrides,
  }
}

export function makeAttachment(overrides: Partial<Attachment> = {}): Attachment {
  const id = overrides.id ?? (`at_${seq()}` as AttachmentId)
  return {
    id,
    url: `https://blob.test/${id}`,
    name: `${id}.png`,
    contentType: 'image/png',
    size: 123,
    ...overrides,
  }
}

export function makeComment(overrides: Partial<Comment> = {}): Comment {
  return {
    id: `c_${seq()}` as CommentId,
    author: makeAuthor(),
    text: 'hello',
    attachments: [],
    createdAt: '2026-05-28T10:00:00.000Z',
    ...overrides,
  }
}

/**
 * Build a NewThread suitable for Repository.createThread.
 * `projectId` defaults to 'proj_test'; pass `overrides` to vary scope or content.
 */
export function makeNewThread(
  overrides: Omit<Partial<NewThread>, 'firstComment'> & {
    firstComment?: Partial<NewComment>
  } = {},
): NewThread {
  const id = (overrides.id ?? `t_${seq()}`) as ThreadId
  const now = overrides.createdAt ?? '2026-05-28T10:00:00.000Z'
  const { firstComment: firstOverride, ...rest } = overrides
  return {
    projectId: 'proj_test',
    id,
    scope: 'page',
    pageKey: 'example.com/about',
    pageUrl: 'https://example.com/about',
    anchor: makeAnchor(),
    status: 'open',
    anchorState: 'anchored',
    captureContext: makeCaptureContext(),
    createdBy: makeAuthor(),
    createdAt: now,
    updatedAt: now,
    lastActivityAt: now,
    schemaVersion: 1,
    firstComment: makeComment({ createdAt: now, ...firstOverride }),
    ...rest,
  }
}
