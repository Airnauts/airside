// packages/client/src/ui/ThreadCard.tsx

import type { AttachmentId, Comment, ThreadListItem } from '@airnauts/comments-core'
import type { ApiClient } from '../api/client'
import type { Identity } from '../identity/storage'
import { cn } from '../lib/cn'
import { useController, useDispatch, useOpenThread } from '../threads/useThreads'
import { CommentList } from './CommentList'
import { Composer, type ComposerSubmit } from './Composer'
import { useToast } from './toast'

let nextTempId = 0

export type ThreadCardProps = {
  item: ThreadListItem
  client: Pick<ApiClient, 'getThread' | 'addComment' | 'setThreadStatus' | 'upload'>
  identity: Identity | null
  onNeedIdentity: (resume: (who: Identity) => void) => void
}

export function ThreadCard({ item, client, identity, onNeedIdentity }: ThreadCardProps) {
  const id = item.id
  const controller = useController()
  const dispatch = useDispatch()
  const { detail, loading, error } = useOpenThread()
  const toast = useToast()
  const resolved = (detail?.status ?? item.status) === 'resolved'

  async function submitReply({ text, attachmentIds, who }: ComposerSubmit) {
    const tempId = `temp-${nextTempId++}`
    const optimistic = {
      id: tempId,
      author: { email: who.email, name: who.name },
      text,
      attachments: [],
      createdAt: new Date().toISOString(),
    } as unknown as Comment
    dispatch({ type: 'ADD_OPTIMISTIC_COMMENT', id, comment: optimistic })
    const wasResolved = resolved
    // Reply reopens optimistically: patch the store AND the runtime cache together (a plain
    // SET_STATUS would be clobbered by the next re-emit) — but only the UI, no network yet. The
    // reopen is persisted below, AFTER the reply saves, so the two requests can't race.
    if (wasResolved) controller.patchStatus(id, 'open')
    let saved: Comment
    try {
      saved = await client.addComment(id, {
        text,
        attachmentIds: attachmentIds as AttachmentId[],
        author: { email: who.email, name: who.name },
      })
    } catch {
      dispatch({ type: 'REMOVE_OPTIMISTIC_COMMENT', id, tempId })
      if (wasResolved) controller.patchStatus(id, 'resolved')
      toast('Failed to post reply')
      return
    }
    dispatch({ type: 'REPLACE_OPTIMISTIC_COMMENT', id, tempId, comment: saved })
    if (wasResolved) {
      // The reply is in; now persist the reopen. On failure, revert the optimistic flip and tell
      // the user the thread is still resolved server-side (rather than silently leaving the pin
      // showing 'open' while the server stays 'resolved').
      try {
        await client.setThreadStatus(id, { status: 'open' })
      } catch {
        controller.patchStatus(id, 'resolved')
        toast('Reply posted, but reopening the thread failed')
      }
    }
  }

  async function toggleStatus() {
    const next = resolved ? 'open' : 'resolved'
    // controller.setStatus updates the store + runtime cache optimistically, persists, and
    // rolls back both on failure (so the pin reverts and a re-emit can't re-clobber it).
    const ok = await controller.setStatus(id, next)
    if (!ok) toast(`Failed to ${next === 'resolved' ? 'resolve' : 'reopen'} thread`)
  }

  return (
    <div className="cmnt:w-80 cmnt:max-w-[calc(100vw-16px)] cmnt:bg-white cmnt:border cmnt:border-gray-200 cmnt:rounded-xl cmnt:overflow-hidden cmnt:text-[13px] cmnt:text-gray-900 cmnt:shadow-[0_12px_32px_rgba(0,0,0,0.18)]">
      <div
        className={cn(
          'cmnt:flex cmnt:items-center cmnt:justify-between cmnt:px-3 cmnt:py-2.5 cmnt:border-b cmnt:border-[#f1f3f5]',
          resolved && 'cmnt:bg-[#f7fdf9]',
        )}
      >
        <span
          className={cn(
            'cmnt:text-[11px] cmnt:font-semibold',
            resolved ? 'cmnt:text-green-600' : 'cmnt:text-blue-600',
          )}
        >
          {resolved
            ? '✓ Resolved'
            : `Open · ${item.commentCount} ${item.commentCount === 1 ? 'comment' : 'comments'}`}
        </span>
        <div className="cmnt:flex cmnt:items-center cmnt:gap-1.5 cmnt:text-gray-500">
          <button
            type="button"
            onClick={toggleStatus}
            className={cn(
              'cmnt:border cmnt:border-gray-300 cmnt:rounded-md cmnt:px-2 cmnt:py-[3px] cmnt:text-[11px] cmnt:font-semibold cmnt:bg-white cmnt:cursor-pointer',
              resolved ? 'cmnt:text-gray-500' : 'cmnt:text-green-600',
            )}
          >
            {resolved ? '↺ Reopen' : '✓ Resolve'}
          </button>
          <button
            type="button"
            aria-label="Close"
            onClick={() => controller.close()}
            className="cmnt:border-none cmnt:bg-transparent cmnt:cursor-pointer cmnt:px-1.5 cmnt:py-0.5"
          >
            ✕
          </button>
        </div>
      </div>
      <CommentList
        comments={detail?.comments ?? []}
        loading={loading}
        error={error}
        onRetry={() => controller.openThread(id)}
      />
      {!loading && (
        <Composer
          mode="reply"
          identity={identity}
          onNeedIdentity={onNeedIdentity}
          onSubmit={submitReply}
          upload={client.upload}
        />
      )}
    </div>
  )
}
