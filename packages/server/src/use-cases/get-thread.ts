import type { Thread, ThreadId, ThreadIdParam } from '@airnauts/comments-core'
import type { Ctx } from '../ctx'
import { NotFoundError } from '../errors'
import type { Repository } from '../repository/types'

export type GetThreadDeps = { repo: Repository }

export async function getThread(
  input: { ctx: Ctx; params: ThreadIdParam; query: undefined; body: undefined },
  deps: GetThreadDeps,
): Promise<Thread> {
  const t = await deps.repo.getThread(
    { projectId: input.ctx.projectId, env: input.ctx.env },
    input.params.id as ThreadId,
  )
  if (!t) throw new NotFoundError(`thread ${input.params.id} not found`)
  return t
}
