import type { ThreadId } from '@airnauts/comments-core'

export type NotificationEventType = 'thread.created' | 'comment.added'

/** Transport-agnostic payload handed to every Notifier. */
export type NotificationEvent = {
  type: NotificationEventType
  projectId: string
  env?: string
  threadId: ThreadId
  pageUrl: string
  pageTitle?: string
  threadUrl: string
  text: string
  author: { email: string; name?: string }
  createdAt: string // ISO
}

/** Outbound port: one per delivery channel (Slack, email, …). */
export interface Notifier {
  /** Human-readable id used only for logging on failure (never log credentials). */
  readonly name: string
  notify(event: NotificationEvent): Promise<void>
}
