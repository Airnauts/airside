import type { Author, ThreadId } from '@airnauts/comments-core'
import type { NotificationEvent, NotificationEventType } from './types'

/**
 * Single source of the notification payload, shared by createThread and
 * addComment so the two event shapes cannot drift. Optional fields are added
 * only when present (keeps the payload clean under exactOptionalPropertyTypes).
 */
export function buildNotificationEvent(
  type: NotificationEventType,
  scope: { projectId: string; env?: string },
  thread: { id: ThreadId; pageUrl: string; pageTitle?: string },
  comment: { text: string; author: Author; createdAt: string },
): NotificationEvent {
  const author: NotificationEvent['author'] = { email: comment.author.email }
  if (comment.author.name !== undefined) author.name = comment.author.name

  const event: NotificationEvent = {
    type,
    projectId: scope.projectId,
    threadId: thread.id,
    pageUrl: thread.pageUrl,
    text: comment.text,
    author,
    createdAt: comment.createdAt,
  }
  if (scope.env !== undefined) event.env = scope.env
  if (thread.pageTitle !== undefined) event.pageTitle = thread.pageTitle
  return event
}
