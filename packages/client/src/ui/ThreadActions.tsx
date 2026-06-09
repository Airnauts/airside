// packages/client/src/ui/ThreadActions.tsx
import type { ThreadActionDescriptor } from '@airnauts/comments-core'
import type { Controller } from '../threads/controller'
import { useThreadActions } from '../threads/useThreads'
import { Button, type ButtonVariant } from './Button'
import { useToast } from './toast'

type PresentationStyle = NonNullable<ThreadActionDescriptor['presentation']>['style']

/** Map a descriptor's presentation style onto the Button primitive's variant. Anything
 *  other than `primary`/`link` (including `secondary` and undefined) renders as `outline`. */
function variantFor(style: PresentationStyle): ButtonVariant {
  if (style === 'primary') return 'primary'
  if (style === 'link') return 'link'
  return 'outline'
}

/**
 * Generic, descriptor-driven toolbar. Renders one {@link Button} per `thread-toolbar` action
 * with no provider-specific knowledge. `actions` and `controller` are passed by the parent;
 * the running-action id is read from {@link useThreadActions} so the button can show progress.
 * Returns `null` when no action targets the toolbar slot.
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
  const { runningActionId } = useThreadActions(id)
  const toolbar = actions.filter((a) => a.slot === 'thread-toolbar')
  if (toolbar.length === 0) return null

  return (
    <div className="cmnt:flex cmnt:flex-wrap cmnt:gap-2">
      {toolbar.map((action) => {
        const running = runningActionId === action.id
        return (
          <Button
            key={action.id}
            variant={variantFor(action.presentation?.style)}
            size="sm"
            disabled={running}
            aria-busy={running}
            onClick={async () => {
              const ok = await controller.runAction(id, action.id)
              if (!ok) toast(`${action.label} failed`)
            }}
          >
            {running && (
              <span aria-hidden="true" className="cmnt:mr-1">
                …
              </span>
            )}
            {action.presentation?.icon && (
              <span aria-hidden="true" className="cmnt:mr-1">
                {action.presentation.icon}
              </span>
            )}
            {action.label}
          </Button>
        )
      })}
    </div>
  )
}
