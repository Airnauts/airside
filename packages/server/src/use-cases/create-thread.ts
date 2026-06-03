import { ANCHOR_SCHEMA_VERSION, type CreateThreadBody, type Thread } from '@airnauts/comments-core'
import type { Ctx } from '../ctx'
import { buildNotificationEvent } from '../notify/build-event'
import { dispatchNotifications } from '../notify/dispatch'
import type { Notifier } from '../notify/types'
import type { Repository } from '../repository/types'
import { resolveAttachments } from './resolve-attachments'

export type CreateThreadDeps = { repo: Repository; notifiers?: Notifier[] }

export async function createThread(
  input: { ctx: Ctx; params: undefined; query: undefined; body: CreateThreadBody },
  deps: CreateThreadDeps,
): Promise<Thread> {
  const { ctx, body } = input
  const scope = { projectId: ctx.projectId, env: ctx.env }
  const nowIso = ctx.now().toISOString()
  const threadId = ctx.ids.thread()
  const commentId = ctx.ids.comment()
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
    anchorState: 'anchored',
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
    deps.notifiers,
    buildNotificationEvent('thread.created', scope, thread, firstComment),
  )
  return thread
}
