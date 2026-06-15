import type { ListThreadsQuery, ThreadListResponse } from '@airnauts/comments-core'
import type { Ctx } from '../ctx'
import { decodeCursor } from '../cursor'
import { ValidationError } from '../errors'
import type { ExtensionRegistry } from '../extensions/registry'
import type { Repository } from '../repository/types'
import { withThreadActions } from './view'

export type ListThreadsDeps = {
  repo: Repository
  registry: ExtensionRegistry
  defaultLimit?: number
  maxLimit?: number
}

export async function listThreads(
  input: { ctx: Ctx; params: undefined; query: ListThreadsQuery; body: undefined },
  deps: ListThreadsDeps,
): Promise<ThreadListResponse> {
  const limit = Math.min(deps.maxLimit ?? 200, deps.defaultLimit ?? 50)
  const cursor = input.query.cursor ?? null
  if (cursor !== null && decodeCursor(cursor) === undefined) {
    throw new ValidationError('invalid cursor')
  }
  const scope = { projectId: input.ctx.projectId, env: input.ctx.env }
  const result = await deps.repo.listThreads({
    ...scope,
    pageKey: input.query.pageKey,
    status: input.query.status,
    sort: 'updatedAt',
    limit,
    cursor,
  })
  return {
    threads: result.threads.map((item) => withThreadActions(item, deps.registry, scope)),
    nextCursor: result.nextCursor,
  }
}
