// packages/client/src/threads/useSubmitReply.ts
import type { AttachmentId, Comment } from '@airnauts/comments-core'
import type { ApiClient } from '../api/client'
import type { ComposerSubmit } from '../ui/Composer'
import { useToast } from '../ui/toast'
import { useController, useDispatch } from './useThreads'

let nextTempId = 0

/**
 * Optimistic reply orchestration for a thread: insert a temp comment + bump the
 * list-item count immediately, optimistically reopen a resolved thread, then
 * persist — rolling each piece back (with a toast) on failure.
 */
export function useSubmitReply(
  id: string,
  client: Pick<ApiClient, 'addComment' | 'setThreadStatus'>,
  resolved: boolean,
) {
  const controller = useController()
  const dispatch = useDispatch()
  const toast = useToast()

  return async function submitReply({ text, attachmentIds, who }: ComposerSubmit) {
    const tempId = `temp-${nextTempId++}`
    const optimistic = {
      id: tempId,
      author: { email: who.email, name: who.name },
      text,
      attachments: [],
      createdAt: new Date().toISOString(),
    } as unknown as Comment
    dispatch({ type: 'ADD_OPTIMISTIC_COMMENT', id, comment: optimistic })
    // Bump the list-item count so the pin badge and panel rows react immediately (the detail
    // header reads the live comment list). Rolled back with -1 if the save fails.
    controller.bumpCommentCount(id, 1)
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
      controller.bumpCommentCount(id, -1)
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
}
