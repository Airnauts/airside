// packages/client/src/ui/ThreadPopover.tsx

import type { ThreadListItem } from '@airnauts/comments-core'
import * as Popover from '@radix-ui/react-popover'
import { useRef } from 'react'
import type { ApiClient } from '../api/client'
import { usePortalContainer } from '../app/providers'
import { useDraft } from '../drafts/DraftsProvider'
import type { Identity } from '../identity/storage'
import type { XY } from '../positioning/coords'
import { useController, useOpenThread } from '../threads/useThreads'
import { Pin } from './Pin'
import { ThreadConversation } from './ThreadConversation'

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
  const draft = useDraft(id)
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
          className="cmnt:pointer-events-auto"
        >
          <ThreadConversation
            item={item}
            client={client}
            identity={identity}
            onNeedIdentity={onNeedIdentity}
            variant="popover"
            draftText={draft.draft.text}
            onDraftTextChange={draft.setText}
            draftAttachment={draft.draft.attachment}
            onDraftAttachmentChange={draft.setAttachment}
          />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
