// packages/client/src/ui/ThreadPopover.tsx

import type { AttachmentId, Comment, ThreadListItem } from '@comments/core'
import * as Popover from '@radix-ui/react-popover'
import { useRef } from 'react'
import type { ApiClient } from '../api/client'
import { usePortalContainer } from '../app/providers'
import type { Identity } from '../identity/storage'
import { cn } from '../lib/cn'
import type { XY } from '../positioning/coords'
import { useController, useDispatch, useOpenThread } from '../threads/useThreads'
import { CommentList } from './CommentList'
import { Composer, type ComposerSubmit } from './Composer'
import { Pin } from './Pin'
import { useToast } from './toast'

let nextTempId = 0

export type ThreadPopoverProps = {
  item: ThreadListItem
  pin: XY
  client: Pick<ApiClient, 'getThread' | 'addComment' | 'setThreadStatus' | 'upload'>
  identity: Identity | null
  onNeedIdentity: (resume: (who: Identity) => void) => void
}

export function ThreadPopover({ item, pin, client, identity, onNeedIdentity }: ThreadPopoverProps) {
  const id = item.id
  const controller = useController()
  const dispatch = useDispatch()
  const { openId, detail, loading, error } = useOpenThread()
  const container = usePortalContainer()
  const toast = useToast()
  const pinRef = useRef<HTMLButtonElement>(null)
  const open = openId === id
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
    if (wasResolved) dispatch({ type: 'SET_STATUS', id, status: 'open' }) // reply reopens (optimistic)
    let saved: Comment
    try {
      saved = await client.addComment(id, {
        text,
        attachmentIds: attachmentIds as AttachmentId[],
        author: { email: who.email, name: who.name },
      })
    } catch {
      dispatch({ type: 'REMOVE_OPTIMISTIC_COMMENT', id, tempId })
      if (wasResolved) dispatch({ type: 'SET_STATUS', id, status: 'resolved' })
      toast('Failed to post reply')
      return
    }
    dispatch({ type: 'REPLACE_OPTIMISTIC_COMMENT', id, tempId, comment: saved })
    if (wasResolved) {
      try {
        await client.setThreadStatus(id, { status: 'open' })
      } catch {
        toast('Reply posted, but reopening the thread failed')
      }
    }
  }

  async function toggleStatus() {
    const next = resolved ? 'open' : 'resolved'
    dispatch({ type: 'SET_STATUS', id, status: next })
    try {
      await client.setThreadStatus(id, { status: next })
    } catch {
      dispatch({ type: 'SET_STATUS', id, status: resolved ? 'resolved' : 'open' })
      toast(`Failed to ${next === 'resolved' ? 'resolve' : 'reopen'} thread`)
    }
  }

  return (
    <Popover.Root
      open={open}
      onOpenChange={(o) => (o ? controller.openThread(id) : controller.close())}
    >
      <Popover.Trigger asChild>
        <Pin ref={pinRef} item={item} pin={pin} onOpen={() => {}} />
      </Popover.Trigger>
      <Popover.Portal container={container ?? undefined}>
        <Popover.Content
          side="top"
          align="center"
          sideOffset={8}
          className="cmnt:w-80 cmnt:bg-white cmnt:border cmnt:border-gray-200 cmnt:rounded-xl cmnt:overflow-hidden cmnt:text-[13px] cmnt:text-gray-900 cmnt:pointer-events-auto cmnt:shadow-[0_12px_32px_rgba(0,0,0,0.18)]"
        >
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
              {resolved ? '✓ Resolved' : `Open · ${item.unresolvedCount} unresolved`}
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
              <Popover.Close
                aria-label="Close"
                className="cmnt:border-none cmnt:bg-transparent cmnt:cursor-pointer cmnt:px-1.5 cmnt:py-0.5"
              >
                ✕
              </Popover.Close>
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
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
