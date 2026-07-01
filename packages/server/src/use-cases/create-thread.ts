import {
  ANCHOR_SCHEMA_VERSION,
  type CreateThreadBody,
  type ThreadView,
} from '@airnauts/airside-core'
import type { Ctx } from '../ctx'
import type { ExtensionRegistry } from '../extensions/registry'
import type { NotificationExtension } from '../extensions/types'
import { buildNotificationEvent } from '../notify/build-event'
import { dispatchNotifications } from '../notify/dispatch'
import type { Repository } from '../repository/types'
import { resolveAttachments } from './resolve-attachments'
import { withThreadActions } from './view'

export type CreateThreadDeps = {
  repo: Repository
  registry: ExtensionRegistry
  notifications?: NotificationExtension[]
}

export async function createThread(
  input: { ctx: Ctx; params: undefined; query: undefined; body: CreateThreadBody },
  deps: CreateThreadDeps,
): Promise<ThreadView> {
  const { ctx, body } = input
  const scope = { projectId: ctx.projectId, env: ctx.env }
  const nowIso = ctx.now().toISOString()
  const threadId = ctx.ids.thread()
  const commentId = ctx.ids.comment()
  // A page-level comment arrives without an anchor; it is born 'unanchored' and opts out of
  // the anchoring machinery. A pin-anchored comment carries its anchor and is 'anchored'.
  const anchored = body.anchor !== undefined
  const attachments = await resolveAttachments(deps.repo, scope, body.comment.attachmentIds)
  const firstComment = {
    id: commentId,
    author: body.author,
    text: body.comment.text,
    attachments,
    createdAt: nowIso,
  }
  const thread = await deps.repo.createThread({
    projectId: ctx.projectId,
    env: ctx.env,
    id: threadId,
    scope: 'page',
    pageKey: body.pageKey ?? null,
    pageUrl: body.pageUrl,
    pageTitle: body.pageTitle,
    anchor: body.anchor,
    status: 'open',
    anchorState: anchored ? 'anchored' : 'unanchored',
    captureContext: body.captureContext,
    provenance: body.provenance,
    createdBy: body.author,
    createdAt: nowIso,
    updatedAt: nowIso,
    lastActivityAt: nowIso,
    schemaVersion: ANCHOR_SCHEMA_VERSION,
    firstComment,
  })
  await dispatchNotifications(
    deps.notifications,
    buildNotificationEvent('thread.created', scope, thread, firstComment, ctx.threadParam),
  )
  return withThreadActions(thread, deps.registry, scope)
}
