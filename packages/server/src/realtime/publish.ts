import type { RealtimeEvent } from '@airnauts/airside-core'
import type { Scope } from '../repository/types'
import type { RealtimeChannel } from './channel'

/**
 * Publish a live-update event after a successful write, failure-isolated: a channel that
 * throws (e.g. a misbehaving custom backplane) is logged and swallowed so it can never
 * break the write that triggered it. A no-op when no channel is configured.
 */
export function publishRealtime(
  channel: RealtimeChannel | undefined,
  scope: Scope,
  event: RealtimeEvent,
  log: (message: string) => void = (m) => console.error(m),
): void {
  if (!channel) return
  try {
    channel.publish(scope, event)
  } catch (err) {
    log(`[airside] realtime publish failed: ${String(err)}`)
  }
}
