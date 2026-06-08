// packages/client/src/ui/ThreadConversation.tsx

import type {
  Attachment,
  AttachmentId,
  Comment,
  Thread,
  ThreadListItem,
} from '@airnauts/comments-core'
import type { ApiClient } from '../api/client'
import type { Identity } from '../identity/storage'
import { cn } from '../lib/cn'
import { useController, useDispatch, useThreadDetail } from '../threads/useThreads'
import { Button } from './Button'
import { CommentList } from './CommentList'
import { Composer, type ComposerSubmit } from './Composer'
import { useToast } from './toast'

let nextTempId = 0

export type ThreadConversationProps = {
  item: ThreadListItem | Thread
  client: Pick<ApiClient, 'getThread' | 'addComment' | 'setThreadStatus' | 'upload'>
  identity: Identity | null
  onNeedIdentity: (resume: (who: Identity) => void) => void
  variant: 'popover' | 'sidebar'
  /** Controlled draft text (shared-draft sync). */
  draftText?: string
  onDraftTextChange?: (text: string) => void
  draftAttachment?: Attachment | null
  onDraftAttachmentChange?: (a: Attachment | null) => void
}

export function ThreadConversation({
  item,
  client,
  identity,
  onNeedIdentity,
  variant,
  draftText,
  onDraftTextChange,
  draftAttachment,
  onDraftAttachmentChange,
}: ThreadConversationProps) {
  const id = item.id
  const controller = useController()
  const dispatch = useDispatch()
  // Read detail by this thread's id — NOT openId — so the sidebar keeps showing its thread even when
  // the pin popover nulls openId on an outside interaction. (Equivalent for the popover: item.id ===
  // openId while it's open.)
  const { detail, loading, error } = useThreadDetail(id)
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

  const wrapper =
    variant === 'popover'
      ? 'cmnt:w-80 cmnt:max-w-[calc(100vw-16px)] cmnt:bg-white cmnt:border cmnt:border-gray-200 cmnt:rounded-xl cmnt:overflow-hidden cmnt:text-[13px] cmnt:text-gray-900 cmnt:shadow-[0_12px_32px_rgba(0,0,0,0.18)]'
      : 'cmnt:w-full cmnt:bg-white cmnt:text-[13px] cmnt:text-gray-900 cmnt:flex cmnt:flex-col cmnt:min-h-0 cmnt:flex-1'

  return (
    <div className={wrapper}>
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
          <Button
            variant="outline"
            size="sm"
            onClick={toggleStatus}
            className={cn(resolved ? 'cmnt:text-gray-500' : 'cmnt:text-green-600')}
          >
            {resolved ? '↺ Reopen' : '✓ Resolve'}
          </Button>
          {variant === 'popover' && (
            <Button
              variant="ghost"
              size="icon"
              aria-label="Close"
              onClick={() => controller.close()}
            >
              ✕
            </Button>
          )}
        </div>
      </div>
      {variant === 'sidebar' && (
        <div className="cmnt:mx-3 cmnt:mt-2 cmnt:px-3 cmnt:py-2 cmnt:rounded-lg cmnt:bg-gray-50 cmnt:border cmnt:border-gray-200">
          <div className="cmnt:text-[13px] cmnt:font-semibold cmnt:text-gray-900 cmnt:truncate">
            {item.pageTitle ?? item.pageUrl}
          </div>
          <div className="cmnt:text-[11px] cmnt:text-gray-500 cmnt:truncate">{item.pageUrl}</div>
        </div>
      )}
      <CommentList
        comments={detail?.comments ?? []}
        loading={loading}
        error={error}
        onRetry={() => controller.refetch(id)}
        variant={variant}
      />
      {!loading && (
        <Composer
          mode="reply"
          // autoFocus defaults to true — both the sidebar detail (mounts fresh on every entry:
          // Reply click, row select, cross-page handoff) and the pin popover focus the reply
          // input on open so the user can type immediately.
          identity={identity}
          onNeedIdentity={onNeedIdentity}
          onSubmit={submitReply}
          upload={client.upload}
          value={draftText}
          onValueChange={onDraftTextChange}
          attachment={draftAttachment}
          onAttachmentChange={onDraftAttachmentChange}
        />
      )}
    </div>
  )
}
