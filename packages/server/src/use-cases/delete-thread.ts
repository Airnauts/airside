import type { ThreadId, ThreadIdParam } from '@airnauts/airside-core'
import type { Ctx } from '../ctx'
import { NotFoundError } from '../errors'
import type { Repository } from '../repository/types'

export type DeleteThreadDeps = { repo: Repository }

export async function deleteThread(
  input: { ctx: Ctx; params: ThreadIdParam; query: undefined; body: undefined },
  deps: DeleteThreadDeps,
): Promise<{ id: ThreadId }> {
  const { ctx, params } = input
  const scope = { projectId: ctx.projectId, env: ctx.env }
  const id = params.id as ThreadId
  // 404 first (mirrors set-thread-status): the repo also scope-gates + throws, but reading
  // first turns "absent/foreign" into a clean NotFoundError rather than a 500.
  const existing = await deps.repo.getThread(scope, id)
  if (!existing) throw new NotFoundError(`thread ${params.id} not found`)
  await deps.repo.deleteThread(scope, id)
  return { id }
}
