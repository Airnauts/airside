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
  /** This thread is the one open in the sidebar panel detail view. */
  selected?: boolean
}

export function ThreadPopover({
  item,
  pin,
  client,
  identity,
  onNeedIdentity,
  focused,
  selected,
}: ThreadPopoverProps) {
  const id = item.id
  const controller = useController()
  const { openId } = useOpenThread()
  const draft = useDraft(id)
  const container = usePortalContainer()
  const pinRef = useRef<HTMLButtonElement>(null)
  const open = openId === id
  // The pin is "active" (reversed colours + raised) whether the user opened its popover or
  // selected its thread in the sidebar — the latter never opens the popover.
  const active = open || selected === true

  return (
    <Popover.Root
      open={open}
      onOpenChange={(o) => (o ? controller.openThread(id) : controller.close())}
    >
      <Popover.Trigger asChild>
        <Pin
          ref={pinRef}
          item={item}
          pin={pin}
          focused={focused}
          active={active}
          onOpen={() => {}}
        />
      </Popover.Trigger>
      <Popover.Portal container={container ?? undefined}>
        <Popover.Content
          data-testid="comments-pin-popover"
          side="bottom"
          align="center"
          sideOffset={8}
          collisionPadding={8}
          // Let the reply Composer's own (deferred) autofocus take focus instead of Radix
          // focusing the first button on open — so clicking a pin lands the caret in the reply input.
          onOpenAutoFocus={(e) => e.preventDefault()}
          // The pin popover dismisses on host-page clicks, not on comments-UI clicks: keep it open
          // when the interaction lands anywhere inside the widget root (the sidebar panel, the
          // launcher, another popover). Switching to a different pin still closes it via the
          // controlled `open={openId === id}`, so this can't strand two pin popovers open.
          onInteractOutside={(e) => {
            const target = e.detail.originalEvent.target as Element | null
            if (target?.closest('[data-comments-root]')) e.preventDefault()
          }}
          className="cmnt:z-[var(--cmnt-z-surface)] cmnt:pointer-events-auto"
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
