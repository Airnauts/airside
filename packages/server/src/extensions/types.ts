import type {
  ExtensionSlot,
  ExternalLink,
  Thread,
  ThreadActionDescriptor,
} from '@airnauts/airside-core'
import { DomainError } from '../errors'
import type { NotificationEvent } from '../notify/types'
import type { Scope } from '../repository/types'

/** What a thread action returns to the server to persist. */
export type ThreadActionResult = {
  /** Persisted on the thread, deduped by provider. Omit if the action persists nothing. */
  externalLink?: ExternalLink
}

/** Context passed to `run`. `scope` is the SERVER scope { projectId, env }. */
export type ThreadActionContext = { thread: Thread; scope: Scope }

/**
 * Context passed to `visibleWhen`. Typed against the BASE field subset because
 * descriptors are evaluated against both full threads and list items.
 * v1 predicates may only read base fields (e.g. externalLinks). List-item paths
 * will NOT have `comments` — do not read it in visibleWhen.
 */
export type ActionVisibilityContext = {
  thread: Pick<Thread, 'id' | 'status' | 'anchorState' | 'externalLinks' | 'pageUrl' | 'pageTitle'>
  scope: Scope
}

export type NotificationExtension = {
  kind: 'notification'
  name: string
  onEvent(event: NotificationEvent): Promise<void>
}

export type ThreadActionExtension = {
  kind: 'thread-action'
  id: string
  provider: string
  label: string
  slot: ExtensionSlot
  presentation?: ThreadActionDescriptor['presentation']
  visibleWhen?: (ctx: ActionVisibilityContext) => boolean
  run: (ctx: ThreadActionContext) => Promise<ThreadActionResult>
}

export type ServerExtension = NotificationExtension | ThreadActionExtension

export function isNotification(e: ServerExtension): e is NotificationExtension {
  return e.kind === 'notification'
}
export function isThreadAction(e: ServerExtension): e is ThreadActionExtension {
  return e.kind === 'thread-action'
}

/**
 * Thrown by an action's `run` for an upstream integration failure (auth/network/4xx-5xx).
 * Extends `DomainError` so `toResponse` maps it to its declared HTTP status (502) via
 * the shared `ERROR_STATUS` table — see core's `INTEGRATION_ERROR`.
 */
export class IntegrationError extends DomainError {
  readonly code = 'INTEGRATION_ERROR' as const
  constructor(
    message: string,
    readonly provider: string,
  ) {
    super(message)
  }
}
