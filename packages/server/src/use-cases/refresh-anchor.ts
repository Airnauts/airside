import type {
  RefreshAnchorBody,
  ThreadId,
  ThreadIdParam,
  ThreadListItemView,
} from '@airnauts/airside-core'
import type { Ctx } from '../ctx'
import { NotFoundError } from '../errors'
import type { ExtensionRegistry } from '../extensions/registry'
import type { RealtimeChannel } from '../realtime/channel'
import { publishRealtime } from '../realtime/publish'
import type { Repository } from '../repository/types'
import { withThreadActions } from './view'

export type RefreshAnchorDeps = {
  repo: Repository
  registry: ExtensionRegistry
  realtime?: RealtimeChannel
}

export async function refreshAnchor(
  input: { ctx: Ctx; params: ThreadIdParam; query: undefined; body: RefreshAnchorBody },
  deps: RefreshAnchorDeps,
): Promise<ThreadListItemView> {
  const { ctx, params, body } = input
  const scope = { projectId: ctx.projectId, env: ctx.env }
  const existing = await deps.repo.getThread(scope, params.id as ThreadId)
  if (!existing) throw new NotFoundError(`thread ${params.id} not found`)
  const updated = await deps.repo.updateAnchor(
    scope,
    params.id as ThreadId,
    {
      selectors: body.selectors,
      signals: body.signals,
      anchorState: body.anchorState,
      selectionLost: body.selectionLost,
    },
    ctx.now().toISOString(),
  )
  publishRealtime(deps.realtime, scope, {
    type: 'thread.updated',
    pageKey: updated.pageKey,
    threadId: updated.id,
    status: updated.status,
    anchorState: updated.anchorState,
  })
  return withThreadActions(updated, deps.registry, scope)
}
