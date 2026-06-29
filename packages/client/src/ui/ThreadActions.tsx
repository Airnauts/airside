// packages/client/src/ui/ThreadActions.tsx
import type { ThreadActionDescriptor } from '@airnauts/airside-core'
import * as Dialog from '@radix-ui/react-dialog'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { useState } from 'react'
import { usePortalContainer } from '../app/providers'
import type { Controller } from '../threads/controller'
import { useThreadActions } from '../threads/useThreads'
import { Button } from './Button'
import { useToast } from './toast'

/**
 * Overflow menu for the thread header `⋯`. Surfaces descriptor-driven `thread-toolbar`
 * actions (each becomes a menu item, with the running-action id read from
 * {@link useThreadActions} so the matching item shows progress and is disabled) plus a
 * built-in, destructive **Delete thread** item. Because Delete is always available the
 * menu now renders unconditionally — even with no toolbar actions.
 *
 * The confirmation popup is a *controlled* `Dialog` rendered as a sibling of the menu
 * (the IdentityModal pattern), never nested inside a `DropdownMenu.Item` — nesting a
 * Dialog in a menu item is a known Radix focus/unmount trap.
 */
export function ThreadActions({
  id,
  actions,
  controller,
}: {
  id: string
  actions: ThreadActionDescriptor[]
  controller: Controller
}) {
  const toast = useToast()
  const container = usePortalContainer()
  const { runningActionId } = useThreadActions(id)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const toolbar = actions.filter((a) => a.slot === 'thread-toolbar')

  async function confirmDelete() {
    setConfirmOpen(false)
    const ok = await controller.deleteThread(id)
    if (!ok) toast('Failed to delete thread')
  }

  return (
    <>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <Button variant="ghost" size="icon" aria-label="More actions">
            ⋯
          </Button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal container={container ?? undefined}>
          <DropdownMenu.Content
            align="end"
            sideOffset={4}
            className="air:z-[var(--air-z-surface)] air:min-w-44 air:bg-white air:border air:border-gray-200 air:rounded-lg air:py-1 air:text-[13px] air:text-gray-900 air:shadow-[0_8px_24px_rgba(0,0,0,0.14)]"
          >
            {toolbar.map((action) => {
              const running = runningActionId === action.id
              return (
                <DropdownMenu.Item
                  key={action.id}
                  disabled={running}
                  onSelect={async () => {
                    const ok = await controller.runAction(id, action.id)
                    if (!ok) toast(`${action.label} failed`)
                  }}
                  className="air:flex air:items-center air:gap-2 air:px-3 air:py-1.5 air:cursor-pointer air:outline-none air:hover:bg-gray-100 air:data-[highlighted]:bg-gray-100 air:data-[disabled]:opacity-50 air:data-[disabled]:cursor-default"
                >
                  {running && (
                    <span aria-hidden="true" className="air:mr-0.5">
                      …
                    </span>
                  )}
                  {action.presentation?.icon && (
                    <span aria-hidden="true">{action.presentation.icon}</span>
                  )}
                  {action.label}
                </DropdownMenu.Item>
              )
            })}
            {toolbar.length > 0 && (
              <DropdownMenu.Separator className="air:my-1 air:h-px air:bg-gray-100" />
            )}
            {/* Controlled trigger only — open the Dialog rendered below, never nest it here.
                Defer the open to a macrotask so this (modal) menu fully closes/unmounts first:
                two modal Radix layers (menu + dialog) mounted at once fight over focus and
                scroll-lock and overflow the stack in jsdom. */}
            <DropdownMenu.Item
              onSelect={() => {
                setTimeout(() => setConfirmOpen(true), 0)
              }}
              className="air:flex air:items-center air:gap-2 air:px-3 air:py-1.5 air:cursor-pointer air:outline-none air:text-red-600 air:hover:bg-red-50 air:data-[highlighted]:bg-red-50"
            >
              Delete thread
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>

      <Dialog.Root open={confirmOpen} onOpenChange={setConfirmOpen}>
        <Dialog.Portal container={container ?? undefined}>
          <Dialog.Overlay className="air:fixed air:inset-0 air:z-[var(--air-z-modal)] air:bg-black/40 air:pointer-events-auto" />
          <Dialog.Content className="air:fixed air:top-1/2 air:left-1/2 air:z-[var(--air-z-modal)] air:-translate-x-1/2 air:-translate-y-1/2 air:bg-white air:p-6 air:rounded-xl air:min-w-80 air:max-w-[calc(100vw-16px)] air:pointer-events-auto air:shadow-[0_12px_32px_rgba(0,0,0,0.18)]">
            <Dialog.Title className="air:mt-0 air:text-[16px] air:font-semibold air:text-gray-900">
              Delete this thread?
            </Dialog.Title>
            <Dialog.Description className="air:mt-1 air:text-sm air:text-gray-500">
              This permanently removes the thread, its comments, and its attachments. This can’t be
              undone.
            </Dialog.Description>
            <div className="air:mt-5 air:flex air:items-center air:justify-end air:gap-2">
              <Dialog.Close asChild>
                <Button variant="outline" size="md">
                  Cancel
                </Button>
              </Dialog.Close>
              <Button
                variant="primary"
                size="md"
                onClick={confirmDelete}
                className="air:bg-red-600 air:hover:bg-red-700"
              >
                Delete thread
              </Button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  )
}
