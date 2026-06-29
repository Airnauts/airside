// packages/client/src/ui/ThreadConversation.tsx

import type { Attachment, Thread, ThreadListItem } from '@airnauts/airside-core'
import { useRef } from 'react'
import type { ApiClient } from '../api/client'
import { cn } from '../lib/cn'
import { useSubmitReply } from '../threads/useSubmitReply'
import { useController, useThreadActions, useThreadDetail } from '../threads/useThreads'
import { Button } from './Button'
import { CommentList } from './CommentList'
import { Composer, type ComposerHandle } from './Composer'
import { DropOverlay, useImageDrop } from './imageDrop'
import { PageContextCard } from './PageContextCard'
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
  /** Sidebar only: click the page-context card to re-navigate to the thread's pin. When omitted
   *  the card stays a non-interactive label. */
  onReturnToPin?: () => void
}

export function ThreadConversation({
  item,
  client,
  variant,
  draftText,
  onDraftTextChange,
  draftAttachment,
  onDraftAttachmentChange,
  onReturnToPin,
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
  // The whole conversation panel is the drop target (header, comment list, composer) — not just
  // the bottom composer strip. A drop anywhere routes into the composer's upload pipeline via
  // its imperative handle, so paste + file-validation behaviour stay owned by the composer.
  const composerRef = useRef<ComposerHandle>(null)
  const { dragActive, dropHandlers } = useImageDrop((files) =>
    composerRef.current?.acceptFiles(files),
  )

  async function toggleStatus() {
    const next = resolved ? 'open' : 'resolved'
    // controller.setStatus updates the store + runtime cache optimistically, persists, and
    // rolls back both on failure (so the pin reverts and a re-emit can't re-clobber it).
    const ok = await controller.setStatus(id, next)
    if (!ok) toast(`Failed to ${next === 'resolved' ? 'resolve' : 'reopen'} thread`)
  }

  const wrapper =
    variant === 'popover'
      ? 'air:relative air:w-80 air:max-w-[calc(100vw-16px)] air:bg-white air:border air:border-gray-200 air:rounded-xl air:overflow-hidden air:text-[13px] air:text-gray-900 air:shadow-[0_12px_32px_rgba(0,0,0,0.18)]'
      : 'air:relative air:w-full air:bg-white air:text-[13px] air:text-gray-900 air:flex air:flex-col air:min-h-0 air:flex-1'

  return (
    <div className={wrapper} {...dropHandlers}>
      {dragActive && <DropOverlay testId="panel-dropzone" />}
      <div
        className={cn(
          'air:flex air:items-center air:justify-between air:px-3 air:py-2.5 air:border-b air:border-[#f1f3f5]',
          resolved && 'air:bg-[#f7fdf9]',
        )}
      >
        <span
          className={cn(
            'air:text-[11px] air:font-semibold',
            resolved ? 'air:text-green-600' : 'air:text-blue-600',
          )}
        >
          {resolved
            ? '✓ Resolved'
            : `Open · ${commentCount} ${commentCount === 1 ? 'comment' : 'comments'}`}
        </span>
        <div className="air:flex air:items-center air:gap-1.5 air:text-gray-500">
          <Button
            variant="outline"
            size="sm"
            onClick={toggleStatus}
            className={cn(resolved ? 'air:text-gray-500' : 'air:text-green-600')}
          >
            {resolved ? '↺ Reopen' : '✓ Resolve'}
          </Button>
          <ThreadActions id={id} actions={actions} controller={controller} />
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
        <div className="air:px-3 air:py-2 air:border-b air:border-[#f1f3f5]">
          <ThreadMetadata links={externalLinks} />
        </div>
      )}
      {variant === 'sidebar' && (
        <PageContextCard
          pageTitle={item.pageTitle}
          pageUrl={item.pageUrl}
          onReturnToPin={onReturnToPin}
        />
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
          ref={composerRef}
          mode="reply"
          // The panel owns the (whole-area) drop region and forwards drops via composerRef, so
          // tell the composer not to also wire its own — otherwise a drop on the composer strip
          // would fire twice (panel + composer) and upload twice.
          externalDrop
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
