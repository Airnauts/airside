// packages/client/src/ui/ThreadActions.tsx
import type { ThreadActionDescriptor } from '@airnauts/comments-core'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { usePortalContainer } from '../app/providers'
import type { Controller } from '../threads/controller'
import { useThreadActions } from '../threads/useThreads'
import { Button } from './Button'
import { useToast } from './toast'

/**
 * Overflow menu for descriptor-driven `thread-toolbar` actions. Renders a single `⋯`
 * trigger; each action becomes a menu item. No provider-specific knowledge — `actions`
 * and `controller` come from the parent; the running-action id is read from
 * {@link useThreadActions} so the matching item shows progress and is disabled. Returns
 * `null` when no action targets the toolbar slot (so the header shows no `⋯`).
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
  const toolbar = actions.filter((a) => a.slot === 'thread-toolbar')
  if (toolbar.length === 0) return null

  return (
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
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}
