// packages/client/src/marker/DraftPopover.tsx

import type { Anchor } from '@airnauts/comments-core'
import * as Popover from '@radix-ui/react-popover'
import type { ApiClient } from '../api/client'
import { usePortalContainer } from '../app/providers'
import { useIdentity } from '../identity/IdentityProvider'
import { useDispatch, useThreadsState } from '../threads/useThreads'
import { initials } from '../ui/avatar'
import { Composer, type ComposerSubmit } from '../ui/Composer'

export type DraftPopoverProps = {
  client: Pick<ApiClient, 'upload'>
  onCreate: (payload: ComposerSubmit, anchor: Anchor) => Promise<void>
}

/** The new-thread draft: a preview pin (teardrop, as ui/Pin.tsx) anchoring a Radix
 *  Popover composer, so Radix handles flip/shift + collision and the composer never
 *  overflows the viewport. Renders nothing while no draft is active. */
export function DraftPopover({ client, onCreate }: DraftPopoverProps) {
  const state = useThreadsState()
  const dispatch = useDispatch()
  const { identity } = useIdentity()
  const container = usePortalContainer()
  const draft = state.draft
  if (!draft) return null
  return (
    <div data-comments-overlay className="cmnt:absolute cmnt:inset-0 cmnt:pointer-events-none">
      <Popover.Root open onOpenChange={(o) => !o && dispatch({ type: 'CLEAR_DRAFT' })}>
        <Popover.Anchor asChild>
          <div
            data-testid="comments-draft-pin"
            aria-hidden="true"
            className="cmnt:absolute cmnt:w-[42px] cmnt:h-[42px] cmnt:-ml-[21px] cmnt:-mt-[42px] cmnt:pointer-events-none"
            style={{ transform: `translate(${draft.pin.x}px, ${draft.pin.y}px)` }}
          >
            <span
              className="cmnt:absolute cmnt:inset-0 cmnt:border-2 cmnt:border-white cmnt:shadow-lg cmnt:bg-blue-600"
              style={{ borderRadius: '50% 50% 50% 0', transform: 'rotate(-45deg)' }}
            />
            <span className="cmnt:absolute cmnt:top-1.5 cmnt:left-1.5 cmnt:w-[30px] cmnt:h-[30px] cmnt:rounded-full cmnt:border-2 cmnt:border-white cmnt:bg-blue-600 cmnt:text-white cmnt:text-xs cmnt:flex cmnt:items-center cmnt:justify-center cmnt:font-semibold">
              {identity ? initials(identity) : ''}
            </span>
          </div>
        </Popover.Anchor>
        <Popover.Portal container={container ?? undefined}>
          <Popover.Content
            side="top"
            align="center"
            sideOffset={8}
            collisionPadding={8}
            onOpenAutoFocus={(e) => e.preventDefault()}
            data-testid="comments-draft"
            className="cmnt:z-[var(--cmnt-z-surface)] cmnt:w-80 cmnt:max-w-[calc(100vw-16px)] cmnt:bg-white cmnt:border cmnt:border-gray-200 cmnt:rounded-xl cmnt:pointer-events-auto cmnt:overflow-hidden cmnt:shadow-[0_12px_32px_rgba(0,0,0,0.18)]"
          >
            {draft.anchor.selection?.quote && (
              <div className="cmnt:mx-3 cmnt:mt-2 cmnt:px-2 cmnt:py-1.5 cmnt:border-l-[3px] cmnt:border-blue-600 cmnt:bg-[#f3f6fc] cmnt:text-xs cmnt:text-gray-700 cmnt:italic">
                “{draft.anchor.selection.quote}”
              </div>
            )}
            <Composer
              mode="newThread"
              upload={client.upload}
              autoFocus
              onCancel={() => dispatch({ type: 'CLEAR_DRAFT' })}
              onSubmit={(payload) => onCreate(payload, draft.anchor)}
            />
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    </div>
  )
}
