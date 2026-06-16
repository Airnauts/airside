import type {
  Anchor,
  Attachment,
  AttachmentId,
  Author,
  CaptureContext,
  Comment,
  ExternalLink,
  Provenance,
  Thread,
  ThreadId,
  ThreadListItem,
  ThreadStatus,
} from '@airnauts/airside-core'

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
  /**
   * Append an external-system link (Jira, etc.) to the thread, deduped by
   * `provider` — a second link with the same provider replaces the first — and
   * bump `updatedAt` to `now`. Scope-gated; rejects for a thread outside `scope`.
   */
  upsertExternalLink(
    scope: Scope,
    threadId: ThreadId,
    link: ExternalLink,
    now: string,
  ): Promise<Thread>
  /**
   * Persist an uploaded attachment's metadata under `scope`, keyed by its id, so a
   * later add-comment / create-thread can resolve the `attachmentIds` the client
   * references (architecture §6, two-step uploads).
   */
  putAttachment(scope: Scope, attachment: Attachment): Promise<void>
  /**
   * Resolve attachment ids to their stored metadata within `scope`. Returns only the
   * attachments that exist (missing/foreign ids are omitted); order is not guaranteed.
   */
  getAttachments(scope: Scope, ids: AttachmentId[]): Promise<Attachment[]>
}
