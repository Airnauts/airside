// packages/client/src/ui/DetachedThread.tsx

import type { ApiClient } from '../api/client'
import { useThreadsState } from '../threads/useThreads'
import { ThreadConversation } from './ThreadConversation'

export type DetachedThreadProps = {
  client: Pick<ApiClient, 'getThread' | 'addComment' | 'setThreadStatus' | 'upload'>
}

/** Renders an open thread that has no pin (orphan) as a fixed-position card, so it stays readable. */
export function DetachedThread({ client }: DetachedThreadProps) {
  const state = useThreadsState()
  const openId = state.openId
  // A placed thread is handled by its pin-anchored ThreadPopover; only render here when pinless.
  if (!openId || state.placementsById[openId]) return null
  const detail = state.detailById[openId]
  if (!detail) return null // detail still loading; the lost-anchor toast already informed the user
  return (
    <div
      data-testid="airside-detached"
      className="air:fixed air:top-4 air:left-1/2 air:-translate-x-1/2 air:z-[var(--air-z-surface)] air:pointer-events-auto"
    >
      <div className="air:mb-1 air:w-80 air:max-w-[calc(100vw-16px)] air:flex air:items-center air:gap-1 air:px-2 air:py-1 air:rounded-[4px] air:bg-amber-100 air:text-amber-700 air:text-[11px] air:font-medium">
        <span aria-hidden={true}>⚠</span> This comment's anchor was lost
      </div>
      <ThreadConversation item={detail} client={client} variant="popover" />
    </div>
  )
}
