import type {
  AnchorState,
  Comment,
  RealtimeEvent,
  ThreadListItem,
  ThreadStatus,
} from '@airnauts/airside-core'

/**
 * Own-echo rule (ADR-0045): the originating client suppresses the live echo of its own
 * `comment.added`, because its optimistic path already applied that comment (the panel bridge
 * counted it, the pin detail appended it). thread.created / thread.updated need no suppression —
 * their reducers are idempotent by id, so a self-echo is a harmless no-op.
 */
function isOwnComment(event: RealtimeEvent, localEmail: string | undefined): boolean {
  return event.type === 'comment.added' && event.comment.author.email === localEmail
}

export type PinReconcileOps = {
  /** Place a live-created thread's pin (idempotent by id). */
  addItem: (thread: ThreadListItem) => void
  /** Append a remote comment to the open detail + bump the count (deduped by comment id). */
  ingestComment: (threadId: string, comment: Comment) => void
  /** Patch a thread's status in the store + runtime cache (idempotent). */
  patchStatus: (threadId: string, status: ThreadStatus) => void
}

/** Apply one page-scoped live event to the pin layer (MarkerLayer). */
export function reconcilePinEvent(
  event: RealtimeEvent,
  localEmail: string | undefined,
  ops: PinReconcileOps,
): void {
  switch (event.type) {
    case 'thread.created':
      ops.addItem(event.thread)
      return
    case 'comment.added':
      if (isOwnComment(event, localEmail)) return
      ops.ingestComment(event.threadId, event.comment)
      return
    case 'thread.updated':
      ops.patchStatus(event.threadId, event.status)
      return
  }
}

export type PanelReconcileOps = {
  /** Insert/replace a thread row (a thread created/updated on any page). */
  upsertThread: (thread: ThreadListItem) => void
  /** Count a live comment once (deduped by comment id). */
  applyComment: (threadId: string, commentId: string) => void
  /** Patch a row's status + anchorState in place (idempotent). */
  patchStatus: (threadId: string, status: ThreadStatus, anchorState: AnchorState) => void
}

/** Apply one all-pages live event to the cross-page panel store (PanelDrawer). */
export function reconcilePanelEvent(
  event: RealtimeEvent,
  localEmail: string | undefined,
  ops: PanelReconcileOps,
): void {
  switch (event.type) {
    case 'thread.created':
      ops.upsertThread(event.thread)
      return
    case 'comment.added':
      if (isOwnComment(event, localEmail)) return
      ops.applyComment(event.threadId, event.comment.id)
      return
    case 'thread.updated':
      ops.patchStatus(event.threadId, event.status, event.anchorState)
      return
  }
}
