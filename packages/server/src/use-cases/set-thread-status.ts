import type { SetThreadStatusBody, Thread, ThreadId, ThreadIdParam } from '@comments/core'
import type { Ctx } from '../ctx'
import { NotFoundError } from '../errors'
import type { Repository } from '../repository/types'

export type SetThreadStatusDeps = { repo: Repository }

export async function setThreadStatus(
  input: { ctx: Ctx; params: ThreadIdParam; query: undefined; body: SetThreadStatusBody },
  deps: SetThreadStatusDeps,
): Promise<Thread> {
  const { ctx, params, body } = input
  const existing = await deps.repo.getThread(
    { projectId: ctx.projectId, env: ctx.env },
    params.id as ThreadId,
  )
  if (!existing) throw new NotFoundError(`thread ${params.id} not found`)
  return deps.repo.setStatus(
    { projectId: ctx.projectId, env: ctx.env },
    params.id as ThreadId,
    body.status,
    ctx.now().toISOString(),
  )
}
