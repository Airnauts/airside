import type { ThreadActionDescriptor } from '@airnauts/comments-core'
import {
  type ActionVisibilityContext,
  type NotificationExtension,
  type ServerExtension,
  type ThreadActionExtension,
  isNotification,
  isThreadAction,
} from './types'

export type ExtensionRegistry = {
  notifications: readonly NotificationExtension[]
  getAction(actionId: string): ThreadActionExtension | undefined
  evaluateDescriptors(ctx: ActionVisibilityContext): ThreadActionDescriptor[]
}

function toDescriptor(a: ThreadActionExtension): ThreadActionDescriptor {
  return {
    id: a.id,
    provider: a.provider,
    label: a.label,
    slot: a.slot,
    ...(a.presentation ? { presentation: a.presentation } : {}),
  }
}

export function buildExtensionRegistry(
  extensions: readonly ServerExtension[] = [],
): ExtensionRegistry {
  const notifications = extensions.filter(isNotification)
  const actions = extensions.filter(isThreadAction)
  const byId = new Map<string, ThreadActionExtension>()
  for (const a of actions) {
    if (byId.has(a.id)) throw new Error(`duplicate thread-action id '${a.id}'`)
    byId.set(a.id, a)
  }
  return {
    notifications,
    getAction: (id) => byId.get(id),
    evaluateDescriptors(ctx) {
      return actions.filter((a) => (a.visibleWhen ? a.visibleWhen(ctx) : true)).map(toDescriptor)
    },
  }
}
