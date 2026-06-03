// packages/client/src/ui/ThreadPopover.tsx

import type { ThreadListItem } from '@airnauts/comments-core'
import * as Popover from '@radix-ui/react-popover'
import { useRef } from 'react'
import type { ApiClient } from '../api/client'
import { usePortalContainer } from '../app/providers'
import { keepOpenThroughIdentityModal } from '../identity/modal-guard'
import type { Identity } from '../identity/storage'
import type { XY } from '../positioning/coords'
import { useController, useOpenThread } from '../threads/useThreads'
import { Pin } from './Pin'
import { ThreadCard } from './ThreadCard'

export type ThreadPopoverProps = {
  item: ThreadListItem
  pin: XY
  client: Pick<ApiClient, 'getThread' | 'addComment' | 'setThreadStatus' | 'upload'>
  identity: Identity | null
  onNeedIdentity: (resume: (who: Identity) => void) => void
  focused?: boolean
}

export function ThreadPopover({
  item,
  pin,
  client,
  identity,
  onNeedIdentity,
  focused,
}: ThreadPopoverProps) {
  const id = item.id
  const controller = useController()
  const { openId } = useOpenThread()
  const container = usePortalContainer()
  const pinRef = useRef<HTMLButtonElement>(null)
  const open = openId === id

  return (
    <Popover.Root
      open={open}
      onOpenChange={(o) => (o ? controller.openThread(id) : controller.close())}
    >
      <Popover.Trigger asChild>
        <Pin ref={pinRef} item={item} pin={pin} focused={focused} onOpen={() => {}} />
      </Popover.Trigger>
      <Popover.Portal container={container ?? undefined}>
        <Popover.Content
          side="bottom"
          align="center"
          sideOffset={8}
          collisionPadding={8}
          // Don't close the pin when the identity modal opens over it (the modal steals focus,
          // which Radix would otherwise read as an outside interaction and dismiss this popover).
          onInteractOutside={keepOpenThroughIdentityModal}
          className="cmnt:pointer-events-auto"
        >
          <ThreadCard
            item={item}
            client={client}
            identity={identity}
            onNeedIdentity={onNeedIdentity}
          />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
