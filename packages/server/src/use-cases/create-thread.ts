import { ANCHOR_SCHEMA_VERSION, type CreateThreadBody, type Thread } from '@airnauts/comments-core'
import type { Ctx } from '../ctx'
import type { Repository } from '../repository/types'

export type CreateThreadDeps = { repo: Repository }

export async function createThread(
  input: { ctx: Ctx; params: undefined; query: undefined; body: CreateThreadBody },
  deps: CreateThreadDeps,
): Promise<Thread> {
  const { ctx, body } = input
  const nowIso = ctx.now().toISOString()
  const threadId = ctx.ids.thread()
  const commentId = ctx.ids.comment()
  const firstComment = {
    id: commentId,
    author: body.author,
    text: body.comment.text,
    attachments: [],
    createdAt: nowIso,
  }
  return deps.repo.createThread({
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
}
