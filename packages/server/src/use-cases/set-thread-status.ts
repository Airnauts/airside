import type {
  SetThreadStatusBody,
  ThreadId,
  ThreadIdParam,
  ThreadView,
} from '@airnauts/airside-core'
import type { Ctx } from '../ctx'
import { NotFoundError } from '../errors'
import type { ExtensionRegistry } from '../extensions/registry'
import type { Repository } from '../repository/types'
import { withThreadActions } from './view'

export type SetThreadStatusDeps = { repo: Repository; registry: ExtensionRegistry }

export async function setThreadStatus(
  input: { ctx: Ctx; params: ThreadIdParam; query: undefined; body: SetThreadStatusBody },
  deps: SetThreadStatusDeps,
): Promise<ThreadView> {
  const { ctx, params, body } = input
  const scope = { projectId: ctx.projectId, env: ctx.env }
  const existing = await deps.repo.getThread(scope, params.id as ThreadId)
  if (!existing) throw new NotFoundError(`thread ${params.id} not found`)
  const updated = await deps.repo.setStatus(
    scope,
    params.id as ThreadId,
    body.status,
    ctx.now().toISOString(),
  )
  return withThreadActions(updated, deps.registry, scope)
}
