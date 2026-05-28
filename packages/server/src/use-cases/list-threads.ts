import type { ListThreadsQuery } from '@comments/core'
import type { Ctx } from '../ctx'
import type { ListResult, Repository } from '../repository/types'

export type ListThreadsDeps = {
  repo: Repository
  defaultLimit?: number
  maxLimit?: number
}

export async function listThreads(
  input: { ctx: Ctx; params: undefined; query: ListThreadsQuery; body: undefined },
  deps: ListThreadsDeps,
): Promise<ListResult> {
  const limit = Math.min(deps.maxLimit ?? 200, deps.defaultLimit ?? 50)
  return deps.repo.listThreads({
    projectId: input.ctx.projectId,
    env: input.ctx.env,
    pageKey: input.query.pageKey,
    status: input.query.status,
    sort: 'updatedAt',
    limit,
    cursor: input.query.cursor ?? null,
  })
}
