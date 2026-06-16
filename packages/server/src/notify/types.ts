import type { ThreadId } from '@airnauts/airside-core'

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
  /**
   * Emails of the people already active in the thread, **excluding** this event's
   * author — i.e. who a per-recipient channel (email) should notify. Distinct,
   * order-preserved. Empty for a brand-new thread (only the author is present).
   */
  participants: string[]
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
