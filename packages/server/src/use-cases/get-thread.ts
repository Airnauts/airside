import type { ThreadId, ThreadIdParam, ThreadView } from '@airnauts/comments-core'
import type { Ctx } from '../ctx'
import { NotFoundError } from '../errors'
import type { ExtensionRegistry } from '../extensions/registry'
import type { Repository } from '../repository/types'
import { withThreadActions } from './view'

export type GetThreadDeps = { repo: Repository; registry: ExtensionRegistry }

export async function getThread(
  input: { ctx: Ctx; params: ThreadIdParam; query: undefined; body: undefined },
  deps: GetThreadDeps,
): Promise<ThreadView> {
  const scope = { projectId: input.ctx.projectId, env: input.ctx.env }
  const t = await deps.repo.getThread(scope, input.params.id as ThreadId)
  if (!t) throw new NotFoundError(`thread ${input.params.id} not found`)
  return withThreadActions(t, deps.registry, scope)
}
