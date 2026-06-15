// packages/client/src/ui/ThreadConversation.tsx

import type { Attachment, Thread, ThreadListItem } from '@airnauts/comments-core'
import type { ApiClient } from '../api/client'
import { cn } from '../lib/cn'
import { useSubmitReply } from '../threads/useSubmitReply'
import { useController, useThreadActions, useThreadDetail } from '../threads/useThreads'
import { Button } from './Button'
import { CommentList } from './CommentList'
import { Composer } from './Composer'
import { ThreadActions } from './ThreadActions'
import { ThreadMetadata } from './ThreadMetadata'
import { useToast } from './toast'

export type ThreadConversationProps = {
  item: ThreadListItem | Thread
  client: Pick<ApiClient, 'getThread' | 'addComment' | 'setThreadStatus' | 'upload'>
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
  variant,
  draftText,
  onDraftTextChange,
  draftAttachment,
  onDraftAttachmentChange,
}: ThreadConversationProps) {
  const id = item.id
  const controller = useController()
  // Read detail by this thread's id — NOT openId — so the sidebar keeps showing its thread even when
  // the pin popover nulls openId on an outside interaction. (Equivalent for the popover: item.id ===
  // openId while it's open.)
  const { detail, loading, error } = useThreadDetail(id)
  const { actions, externalLinks } = useThreadActions(id)
  const toast = useToast()
  const resolved = (detail?.status ?? item.status) === 'resolved'
  // Prefer the live detail's comment list for the count: it carries optimistic replies and is never
  // rebuilt by a reposition emit, so the header is correct regardless of where `item` came from
  // (the panel list, or an id-loaded detached thread). Falls back to the list item while loading.
  const commentCount = detail ? detail.comments.length : item.commentCount
  const submitReply = useSubmitReply(id, client, resolved)

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
            : `Open · ${commentCount} ${commentCount === 1 ? 'comment' : 'comments'}`}
        </span>
        <div className="cmnt:flex cmnt:items-center cmnt:gap-1.5 cmnt:text-gray-500">
          <ThreadActions id={id} actions={actions} controller={controller} />
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
      {externalLinks.length > 0 && (
        <div className="cmnt:px-3 cmnt:py-2 cmnt:border-b cmnt:border-[#f1f3f5]">
          <ThreadMetadata links={externalLinks} />
        </div>
      )}
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
