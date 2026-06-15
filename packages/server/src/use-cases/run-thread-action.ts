import type { ThreadActionParam, ThreadView } from '@airnauts/comments-core'
import type { Ctx } from '../ctx'
import { ConflictError, NotFoundError } from '../errors'
import type { ExtensionRegistry } from '../extensions/registry'
import type { Repository } from '../repository/types'
import { withThreadActions } from './view'

export type RunThreadActionDeps = { repo: Repository; registry: ExtensionRegistry }

export async function runThreadAction(
  input: { ctx: Ctx; params: ThreadActionParam; query: undefined; body: undefined },
  deps: RunThreadActionDeps,
): Promise<ThreadView> {
  const { ctx, params } = input
  const scope = { projectId: ctx.projectId, env: ctx.env }

  const action = deps.registry.getAction(params.actionId)
  if (!action) throw new NotFoundError(`action ${params.actionId} not found`)

  const thread = await deps.repo.getThread(scope, params.id)
  if (!thread) throw new NotFoundError(`thread ${params.id} not found`)

  const visible = action.visibleWhen ? action.visibleWhen({ thread, scope }) : true
  if (!visible) throw new ConflictError(`action ${params.actionId} not available for this thread`)

  // Action failures are NOT isolated — the user explicitly requested this.
  // An IntegrationError from run() surfaces to the reviewer (mapped to 502 by INTEGRATION_ERROR).
  const result = await action.run({ thread, scope })

  if (!result.externalLink) {
    return withThreadActions(thread, deps.registry, scope)
  }

  // Persist the link. If this throws AFTER the external issue was created, the error
  // surfaces and the issue key/url should already have been logged by the action
  // (v1 mitigation for create-succeeds/persist-fails).
  const updated = await deps.repo.upsertExternalLink(
    scope,
    params.id,
    result.externalLink,
    ctx.now().toISOString(),
  )
  return withThreadActions(updated, deps.registry, scope)
}
