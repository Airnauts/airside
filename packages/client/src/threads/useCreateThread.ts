import type { Anchor, AttachmentId, Provenance, ThreadView } from '@airnauts/airside-core'
import { useCallback } from 'react'
import type { ApiClient } from '../api/client'
import { ApiError } from '../api/errors'
import { buildCaptureContext } from '../config'
import type { ComposerSubmit } from '../ui/Composer'
import { useToast } from '../ui/toast'
import { useController, useDispatch } from './useThreads'

export type UseCreateThreadOptions = {
  client: Pick<ApiClient, 'createThread'>
  /** The page key for the current URL, resolved by the caller (kept live past an SPA route change). */
  pageKey: string
  provenance?: Provenance
}

/**
 * The new-thread create side-effect shared by the pin flow (DraftPopover/MarkerLayer) and the
 * page-level "comment on this page" flow: build the request (capturing pageTitle + captureContext),
 * POST it, seed the detail cache from the response, and notify the open panel. Pass `anchor` for a
 * pin-anchored thread; omit it for a page-level (unanchored) one. The caller runs its own
 * path-specific follow-up (pin focus vs. `panel.openDetail`) on the returned thread; on failure a
 * toast is surfaced here and the hook resolves to `null`.
 */
export function useCreateThread({ client, pageKey, provenance }: UseCreateThreadOptions) {
  const dispatch = useDispatch()
  const controller = useController()
  const toast = useToast()

  return useCallback(
    async (
      { text, attachmentIds, who }: ComposerSubmit,
      anchor?: Anchor,
    ): Promise<ThreadView | null> => {
      try {
        // Trim + omit an empty title so the page-context card falls back to the URL instead of a
        // blank bold line (#56).
        const pageTitle = document.title.trim()
        const created = await client.createThread({
          pageUrl: window.location.href,
          pageKey,
          ...(pageTitle ? { pageTitle } : {}),
          // Omitted for a page-level comment — the server then marks it `anchorState: 'unanchored'`.
          ...(anchor ? { anchor } : {}),
          comment: { text, attachmentIds: attachmentIds as AttachmentId[] },
          author: { email: who.email, name: who.name },
          captureContext: buildCaptureContext(),
          provenance,
        })
        // Seed the detail cache from the create response (a full Thread with its first comment) so
        // the surface that opens it renders the comment immediately — no getThread round-trip.
        dispatch({ type: 'DETAIL_LOADED', id: created.id, thread: created })
        // Bridge the create into the open sidebar list so the new thread surfaces without a reopen.
        controller.notifyThreadCreated()
        return created
      } catch (err) {
        toast(err instanceof ApiError ? err.message : 'Failed to create comment')
        return null
      }
    },
    [client, pageKey, provenance, dispatch, controller, toast],
  )
}
