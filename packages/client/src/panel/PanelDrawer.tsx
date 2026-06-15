// packages/client/src/panel/PanelDrawer.tsx

import * as Dialog from '@radix-ui/react-dialog'
import { useEffect } from 'react'
import type { ApiClient } from '../api/client'
import { usePortalContainer } from '../app/providers'
import { useController } from '../threads/useThreads'
import { goToThread } from './navigate'
import { PanelDetailView } from './PanelDetailView'
import { PanelListView } from './PanelListView'
import { usePanelController, usePanelState } from './PanelProvider'

export type PanelDrawerProps = {
  resolvePageKey: (url: string) => string
  client: Pick<ApiClient, 'getThread' | 'addComment' | 'setThreadStatus' | 'upload'>
}

/** The right-hand comments drawer: a non-modal Dialog shell that shows either the
 *  cross-page thread list or a single thread's detail pane. */
export function PanelDrawer({ resolvePageKey, client }: PanelDrawerProps) {
  const state = usePanelState()
  const panel = usePanelController()
  const threads = useController()
  const container = usePortalContainer()

  // Drawer-open reconciliation: when a status change persists, refetch the current filter.
  useEffect(() => {
    if (!state.open) return
    threads.registerStatusListener(() => void panel.refresh())
    return () => threads.registerStatusListener(null)
  }, [state.open, threads, panel])

  // Keep the list rows' counts in sync with an optimistic reply posted from the open detail.
  useEffect(() => {
    if (!state.open) return
    threads.registerCommentCountListener((id, delta) => panel.bumpCommentCount(id, delta))
    return () => threads.registerCommentCountListener(null)
  }, [state.open, threads, panel])

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
          data-testid="comments-panel"
          onInteractOutside={(e) => e.preventDefault()}
          // Don't let the dialog grab focus on open (e.g. onto the close button). The detail
          // view's reply composer focuses itself; on the list view nothing should be focused.
          onOpenAutoFocus={(e) => e.preventDefault()}
          className="cmnt:fixed cmnt:z-[var(--cmnt-z-surface)] cmnt:top-0 cmnt:right-0 cmnt:bottom-0 cmnt:w-[360px] cmnt:max-w-[calc(100vw-16px)] cmnt:bg-white cmnt:border-l cmnt:border-gray-200 cmnt:flex cmnt:flex-col cmnt:pointer-events-auto cmnt:shadow-[-8px_0_24px_rgba(0,0,0,0.12)]"
        >
          {state.view === 'detail' && state.detailThreadId ? (
            <PanelDetailView
              threadId={state.detailThreadId}
              listItem={detailItem}
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
