import type { RefreshAnchorBody, ThreadId, ThreadIdParam, ThreadListItem } from '@comments/core'
import type { Ctx } from '../ctx'
import { NotFoundError } from '../errors'
import type { Repository } from '../repository/types'

export type RefreshAnchorDeps = { repo: Repository }

export async function refreshAnchor(
  input: { ctx: Ctx; params: ThreadIdParam; query: undefined; body: RefreshAnchorBody },
  deps: RefreshAnchorDeps,
): Promise<ThreadListItem> {
  const { ctx, params, body } = input
  const existing = await deps.repo.getThread(
    { projectId: ctx.projectId, env: ctx.env },
    params.id as ThreadId,
  )
  if (!existing) throw new NotFoundError(`thread ${params.id} not found`)
  return deps.repo.updateAnchor(
    { projectId: ctx.projectId, env: ctx.env },
    params.id as ThreadId,
    {
      selectors: body.selectors,
      signals: body.signals,
      anchorState: body.anchorState,
      selectionLost: body.selectionLost,
    },
    ctx.now().toISOString(),
  )
}
