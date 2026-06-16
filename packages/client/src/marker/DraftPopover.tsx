// packages/client/src/marker/DraftPopover.tsx

import type { Anchor } from '@airnauts/airside-core'
import * as Popover from '@radix-ui/react-popover'
import type { ApiClient } from '../api/client'
import { usePortalContainer } from '../app/providers'
import { useIdentity } from '../identity/IdentityProvider'
import { useDispatch, useThreadsState } from '../threads/useThreads'
import { initials } from '../ui/avatar'
import { Composer, type ComposerSubmit } from '../ui/Composer'
import { TEARDROP_STYLE } from '../ui/Pin'

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
    <div data-airside-overlay className="air:absolute air:inset-0 air:pointer-events-none">
      <Popover.Root open onOpenChange={(o) => !o && dispatch({ type: 'CLEAR_DRAFT' })}>
        <Popover.Anchor asChild>
          <div
            data-testid="airside-draft-pin"
            aria-hidden="true"
            className="air:absolute air:w-[42px] air:h-[42px] air:-ml-[21px] air:-mt-[42px] air:pointer-events-none"
            style={{ transform: `translate(${draft.pin.x}px, ${draft.pin.y}px)` }}
          >
            <span
              className="air:absolute air:inset-0 air:border-2 air:border-white air:shadow-lg air:bg-blue-600"
              style={TEARDROP_STYLE}
            />
            <span className="air:absolute air:top-1.5 air:left-1.5 air:w-[30px] air:h-[30px] air:rounded-full air:border-2 air:border-white air:bg-blue-600 air:text-white air:text-xs air:flex air:items-center air:justify-center air:font-semibold">
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
            data-testid="airside-draft"
            className="air:z-[var(--air-z-surface)] air:w-80 air:max-w-[calc(100vw-16px)] air:bg-white air:border air:border-gray-200 air:rounded-xl air:pointer-events-auto air:overflow-hidden air:shadow-[0_12px_32px_rgba(0,0,0,0.18)]"
          >
            {draft.anchor.selection?.quote && (
              <div className="air:mx-3 air:mt-2 air:px-2 air:py-1.5 air:border-l-[3px] air:border-blue-600 air:bg-[#f3f6fc] air:text-xs air:text-gray-700 air:italic">
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
