import type { NotificationExtension } from '../extensions/types'
import type { NotificationEvent } from './types'

/**
 * Fan an event out to every notification extension. Never rejects: an extension
 * that throws — synchronously or by rejecting — is logged (name + reason) and
 * swallowed, so a failed notification cannot break the comment write, and one bad
 * extension never starves the rest. Awaited by the caller so the delivery is not
 * dropped when a serverless function freezes after the response.
 */
export async function dispatchNotifications(
  notifications: readonly NotificationExtension[] | undefined,
  event: NotificationEvent,
  log: (message: string) => void = (m) => console.error(m),
): Promise<void> {
  if (!notifications || notifications.length === 0) return
  // `async` arrow so an extension that throws synchronously becomes a rejection
  // allSettled can catch (a raw `.map((n) => n.onEvent(event))` would throw out
  // of the map and abort the whole batch).
  const results = await Promise.allSettled(notifications.map(async (n) => n.onEvent(event)))
  results.forEach((result, i) => {
    if (result.status === 'rejected') {
      const name = notifications[i]?.name ?? 'unknown'
      log(`[airside] notifier "${name}" failed: ${String(result.reason)}`)
    }
  })
}
