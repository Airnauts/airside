import type {
  Anchor,
  Author,
  CaptureContext,
  Comment,
  Provenance,
  Thread,
  ThreadId,
  ThreadListItem,
  ThreadStatus,
} from '@airnauts/comments-core'

export type Scope = {
  projectId: string
  env?: string
}

export type ListQuery = Scope & {
  pageKey?: string
  status?: ThreadStatus
  sort: 'updatedAt'
  limit: number
  cursor?: string | null
}

export type ListResult = {
  threads: ThreadListItem[]
  nextCursor: string | null
}

export type NewThread = Scope & {
  id: ThreadId
  scope: 'page'
  pageKey: string | null
  pageUrl: string
  pageTitle?: string
  anchor: Anchor
  status: 'open'
  anchorState: 'anchored'
  selectionLost?: boolean
  captureContext: CaptureContext
  provenance?: Provenance
  createdBy: Author
  createdAt: string
  updatedAt: string
  lastActivityAt: string
  schemaVersion: number
  firstComment: Comment
}

export type NewComment = Comment

export type AnchorPatch = {
  selectors?: [string, string]
  signals?: Anchor['signals']
  anchorState: Thread['anchorState']
  selectionLost?: boolean
}

export interface Repository {
  createThread(input: NewThread): Promise<Thread>
  getThread(scope: Scope, id: ThreadId): Promise<Thread | null>
  listThreads(query: ListQuery): Promise<ListResult>
  addComment(scope: Scope, threadId: ThreadId, comment: NewComment): Promise<Comment>
  setStatus(scope: Scope, threadId: ThreadId, status: ThreadStatus, now: string): Promise<Thread>
  updateAnchor(
    scope: Scope,
    threadId: ThreadId,
    patch: AnchorPatch,
    now: string,
  ): Promise<ThreadListItem>
}
