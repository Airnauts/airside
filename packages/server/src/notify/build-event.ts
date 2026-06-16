import { type Author, type ThreadId, threadLink } from '@airnauts/airside-core'
import type { NotificationEvent, NotificationEventType } from './types'

/**
 * Single source of the notification payload, shared by createThread and
 * addComment so the two event shapes cannot drift. The deep-link is built here
 * (not per notifier) from the server's configured threadParam, and the
 * participant list (distinct comment authors already on the thread, minus this
 * event's author) is derived here so per-recipient channels don't re-walk the
 * thread. Optional fields are added only when present (keeps the payload clean
 * under exactOptionalPropertyTypes).
 */
export function buildNotificationEvent(
  type: NotificationEventType,
  scope: { projectId: string; env?: string },
  thread: { id: ThreadId; pageUrl: string; pageTitle?: string; comments: { author: Author }[] },
  comment: { text: string; author: Author; createdAt: string },
  threadParam: string,
): NotificationEvent {
  const author: NotificationEvent['author'] = { email: comment.author.email }
  if (comment.author.name !== undefined) author.name = comment.author.name

  // Distinct emails of everyone already in the thread, minus the author of this
  // event (you are never notified of your own comment). A new thread's only
  // comment is the author's, so this is empty there.
  const participants = [...new Set(thread.comments.map((c) => c.author.email))].filter(
    (email) => email !== comment.author.email,
  )

  const event: NotificationEvent = {
    type,
    projectId: scope.projectId,
    threadId: thread.id,
    pageUrl: thread.pageUrl,
    threadUrl: threadLink(thread.pageUrl, thread.id, threadParam),
    participants,
    text: comment.text,
    author,
    createdAt: comment.createdAt,
  }
  if (scope.env !== undefined) event.env = scope.env
  if (thread.pageTitle !== undefined) event.pageTitle = thread.pageTitle
  return event
}
