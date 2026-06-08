// packages/client/src/ui/DetachedThread.tsx

import type { ApiClient } from '../api/client'
import type { Identity } from '../identity/storage'
import { useThreadsState } from '../threads/useThreads'
import { ThreadConversation } from './ThreadConversation'

export type DetachedThreadProps = {
  client: Pick<ApiClient, 'getThread' | 'addComment' | 'setThreadStatus' | 'upload'>
  identity: Identity | null
  onNeedIdentity: (resume: (who: Identity) => void) => void
}

/** Renders an open thread that has no pin (orphan) as a fixed-position card, so it stays readable. */
export function DetachedThread({ client, identity, onNeedIdentity }: DetachedThreadProps) {
  const state = useThreadsState()
  const openId = state.openId
  // A placed thread is handled by its pin-anchored ThreadPopover; only render here when pinless.
  if (!openId || state.placementsById[openId]) return null
  const detail = state.detailById[openId]
  if (!detail) return null // detail still loading; the lost-anchor toast already informed the user
  return (
    <div
      data-testid="comments-detached"
      className="cmnt:fixed cmnt:top-4 cmnt:left-1/2 cmnt:-translate-x-1/2 cmnt:z-50 cmnt:pointer-events-auto"
    >
      <div className="cmnt:mb-1 cmnt:w-80 cmnt:max-w-[calc(100vw-16px)] cmnt:flex cmnt:items-center cmnt:gap-1 cmnt:px-2 cmnt:py-1 cmnt:rounded-[4px] cmnt:bg-amber-100 cmnt:text-amber-700 cmnt:text-[11px] cmnt:font-medium">
        <span aria-hidden={true}>⚠</span> This comment's anchor was lost
      </div>
      <ThreadConversation
        item={detail}
        client={client}
        identity={identity}
        onNeedIdentity={onNeedIdentity}
        variant="popover"
      />
    </div>
  )
}
