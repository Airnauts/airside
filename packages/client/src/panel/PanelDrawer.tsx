// packages/client/src/panel/PanelDrawer.tsx

import type { RealtimeEvent } from '@airnauts/airside-core'
import * as Dialog from '@radix-ui/react-dialog'
import { useCallback, useEffect } from 'react'
import type { ApiClient } from '../api/client'
import { usePortalContainer } from '../app/providers'
import { useIdentity } from '../identity/IdentityProvider'
import { reconcilePanelEvent } from '../realtime/reconcile'
import { useLiveStream } from '../realtime/useLiveStream'
import { useController } from '../threads/useThreads'
import { goToThread } from './navigate'
import { PanelDetailView } from './PanelDetailView'
import { PanelListView } from './PanelListView'
import { usePanelController, usePanelState } from './PanelProvider'

export type PanelDrawerProps = {
  resolvePageKey: (url: string) => string
  client: Pick<
    ApiClient,
    'getThread' | 'addComment' | 'setThreadStatus' | 'upload' | 'streamEvents'
  >
}

/** The right-hand comments drawer: a non-modal Dialog shell that shows either the
 *  cross-page thread list or a single thread's detail pane. */
export function PanelDrawer({ resolvePageKey, client }: PanelDrawerProps) {
  const state = usePanelState()
  const panel = usePanelController()
  const threads = useController()
  const container = usePortalContainer()
  const { identity } = useIdentity()

  // Drawer-open reconciliation: when a status change persists, refetch the current filter.
  useEffect(() => {
    if (!state.open) return
    threads.registerStatusListener(() => void panel.refresh())
    return () => threads.registerStatusListener(null)
  }, [state.open, threads, panel])

  // Keep the list rows' counts in sync with an optimistic reply posted from the open detail.
  // This is the LOCAL optimistic path only; remote comments arrive via the all-pages stream below.
  useEffect(() => {
    if (!state.open) return
    threads.registerCommentCountListener((id, delta) => panel.bumpCommentCount(id, delta))
    return () => threads.registerCommentCountListener(null)
  }, [state.open, threads, panel])

  // Live cross-page updates (ADR-0045): while the drawer is open, hold an all-pages /events
  // stream so threads/comments/resolutions on ANY page reconcile into the list without a reload.
  // A thread.created on another page becomes a new row; comment counts and statuses update live.
  // The local author's own comment echo is suppressed — the optimistic bridge above already
  // counted it; APPLY_COMMENT is id-idempotent so it would otherwise converge, but skipping it
  // avoids relying on the real id reaching the ledger before the echo.
  const onPanelEvent = useCallback(
    (event: RealtimeEvent) => {
      reconcilePanelEvent(event, identity?.email, {
        upsertThread: (thread) => panel.upsertThread(thread),
        applyComment: (threadId, commentId) => panel.applyComment(threadId, commentId),
        patchStatus: (threadId, status, anchorState) =>
          panel.patchStatus(threadId, status, anchorState),
      })
    },
    [panel, identity?.email],
  )
  useLiveStream({
    client,
    enabled: state.open,
    onEvent: onPanelEvent,
    // On (re)connect, reload the current filter so missed cross-page events reconcile.
    onConnect: () => void panel.refresh(),
  })

  // Fallback / freshness: while open, refetch when the tab regains focus or becomes visible —
  // covers the stream being unavailable (older host, stream down) and reconciles after a sleep.
  useEffect(() => {
    if (!state.open) return
    const refetch = () => {
      if (document.visibilityState !== 'hidden') void panel.refresh()
    }
    window.addEventListener('focus', refetch)
    document.addEventListener('visibilitychange', refetch)
    return () => {
      window.removeEventListener('focus', refetch)
      document.removeEventListener('visibilitychange', refetch)
    }
  }, [state.open, panel])

  function onSelect(row: { id: string; pageKey: string | null; pageUrl: string }) {
    const here = resolvePageKey(window.location.href)
    if (row.pageKey === here) {
      // Same page: show the in-sidebar detail and focus (pulse) the pin. Do NOT open the pin's
      // popover (the sidebar is the surface) and do NOT close one that's already open — a pin thread
      // the user opened stays open while they browse the sidebar. requestFocus pulses the pin and
      // lazy-loads the detail (read by id below); it leaves openId untouched.
      panel.openDetail(row.id)
      threads.requestFocus(row.id)
    } else {
      goToThread({ id: row.id, pageUrl: row.pageUrl, openDetail: true })
    }
  }

  const detailItem =
    state.detailThreadId != null
      ? (state.list.find((t) => t.id === state.detailThreadId) ??
        state.needsReview.find((t) => t.id === state.detailThreadId) ??
        null)
      : null

  return (
    <Dialog.Root open={state.open} modal={false} onOpenChange={(o) => !o && panel.closePanel()}>
      <Dialog.Portal container={container ?? undefined}>
        <Dialog.Content
          data-testid="airside-panel"
          data-airside-chrome
          onInteractOutside={(e) => e.preventDefault()}
          // Don't let the dialog grab focus on open (e.g. onto the close button). The detail
          // view's reply composer focuses itself; on the list view nothing should be focused.
          onOpenAutoFocus={(e) => e.preventDefault()}
          className="air:fixed air:z-[var(--air-z-surface)] air:top-0 air:right-0 air:bottom-0 air:w-[360px] air:max-w-[calc(100vw-16px)] air:bg-white air:border-l air:border-gray-200 air:flex air:flex-col air:pointer-events-auto air:shadow-[-8px_0_24px_rgba(0,0,0,0.12)]"
        >
          {state.view === 'detail' && state.detailThreadId ? (
            <PanelDetailView
              threadId={state.detailThreadId}
              listItem={detailItem}
              resolvePageKey={resolvePageKey}
              client={client}
              onBack={() => panel.back()}
            />
          ) : (
            <PanelListView onSelect={onSelect} />
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
