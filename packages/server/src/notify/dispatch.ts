import type { NotificationEvent, Notifier } from './types'

/**
 * Fan an event out to every notifier. Never rejects: a notifier that throws —
 * synchronously or by rejecting — is logged (name + reason) and swallowed, so a
 * failed notification cannot break the comment write, and one bad notifier never
 * starves the rest. Awaited by the caller so the delivery is not dropped when a
 * serverless function freezes after the response.
 */
export async function dispatchNotifications(
  notifiers: readonly Notifier[] | undefined,
  event: NotificationEvent,
  log: (message: string) => void = (m) => console.error(m),
): Promise<void> {
  if (!notifiers || notifiers.length === 0) return
  // `async` arrow so a notifier that throws synchronously becomes a rejection
  // allSettled can catch (a raw `.map((n) => n.notify(event))` would throw out
  // of the map and abort the whole batch).
  const results = await Promise.allSettled(notifiers.map(async (n) => n.notify(event)))
  results.forEach((result, i) => {
    if (result.status === 'rejected') {
      const name = notifiers[i]?.name ?? 'unknown'
      log(`[comments] notifier "${name}" failed: ${String(result.reason)}`)
    }
  })
}
