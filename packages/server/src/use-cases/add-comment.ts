import type { AddCommentBody, Comment, ThreadId, ThreadIdParam } from '@airnauts/comments-core'
import type { Ctx } from '../ctx'
import { NotFoundError } from '../errors'
import { buildNotificationEvent } from '../notify/build-event'
import { dispatchNotifications } from '../notify/dispatch'
import type { Notifier } from '../notify/types'
import type { Repository } from '../repository/types'
import { resolveAttachments } from './resolve-attachments'

export type AddCommentDeps = { repo: Repository; notifiers?: Notifier[] }

export async function addComment(
  input: { ctx: Ctx; params: ThreadIdParam; query: undefined; body: AddCommentBody },
  deps: AddCommentDeps,
): Promise<Comment> {
  const { ctx, params, body } = input
  const scope = { projectId: ctx.projectId, env: ctx.env }
  // Confirm the thread exists in scope so we can return a typed 404; the repository's
  // own addComment throws an opaque Error. `existing` also supplies the page context
  // for the notification.
  const existing = await deps.repo.getThread(scope, params.id as ThreadId)
  if (!existing) throw new NotFoundError(`thread ${params.id} not found`)
  const attachments = await resolveAttachments(deps.repo, scope, body.attachmentIds)
  const comment: Comment = {
    id: ctx.ids.comment(),
    author: body.author,
    text: body.text,
    attachments,
    createdAt: ctx.now().toISOString(),
  }
  const saved = await deps.repo.addComment(scope, params.id as ThreadId, comment)
  await dispatchNotifications(
    deps.notifiers,
    buildNotificationEvent('comment.added', scope, existing, saved, ctx.threadParam),
  )
  return saved
}
