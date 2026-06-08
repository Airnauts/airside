// packages/client/src/panel/PanelDrawer.tsx

import type { ThreadListItem } from '@airnauts/comments-core'
import * as Dialog from '@radix-ui/react-dialog'
import { useEffect } from 'react'
import type { ApiClient } from '../api/client'
import { usePortalContainer } from '../app/providers'
import { useDraft } from '../drafts/DraftsProvider'
import type { Identity } from '../identity/storage'
import { cn } from '../lib/cn'
import { useController, useShowResolved, useThreadDetail } from '../threads/useThreads'
import { Button } from '../ui/Button'
import { ThreadConversation } from '../ui/ThreadConversation'
import { goToThread } from './navigate'
import { usePanelController, usePanelState } from './PanelProvider'
import { PanelRow } from './PanelRow'
import { mainListExcludingReview, type PanelFilter } from './state'

const FILTERS: { value: PanelFilter; label: string }[] = [
  { value: 'open', label: 'Open' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'all', label: 'All' },
]

export type PanelDrawerProps = {
  resolvePageKey: (url: string) => string
  client: Pick<ApiClient, 'getThread' | 'addComment' | 'setThreadStatus' | 'upload'>
  identity: Identity | null
  onNeedIdentity: (resume: (who: Identity) => void) => void
}

function DetailView({
  threadId,
  listItem,
  client,
  identity,
  onNeedIdentity,
}: {
  threadId: string
  listItem: ThreadListItem | null
  client: PanelDrawerProps['client']
  identity: Identity | null
  onNeedIdentity: PanelDrawerProps['onNeedIdentity']
}) {
  const { detail } = useThreadDetail(threadId)
  const draft = useDraft(threadId)
  // Prefer the panel list item (instant); fall back to the id-keyed loaded thread (cross-page /
  // deep-link, where the thread isn't in the list). Reading by threadId — not openId — keeps the
  // pane populated regardless of the popover's open state.
  const item = listItem ?? detail
  return (
    <div className="cmnt:flex-1 cmnt:overflow-y-auto cmnt:flex cmnt:flex-col cmnt:min-h-0">
      {item && (
        <ThreadConversation
          item={item}
          client={client}
          identity={identity}
          onNeedIdentity={onNeedIdentity}
          variant="sidebar"
          draftText={draft.draft.text}
          onDraftTextChange={draft.setText}
          draftAttachment={draft.draft.attachment}
          onDraftAttachmentChange={draft.setAttachment}
        />
      )}
    </div>
  )
}

export function PanelDrawer({
  resolvePageKey,
  client,
  identity,
  onNeedIdentity,
}: PanelDrawerProps) {
  const state = usePanelState()
  const panel = usePanelController()
  const threads = useController()
  const showResolved = useShowResolved()
  const container = usePortalContainer()
  const mainList = mainListExcludingReview(state)

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
          className="cmnt:fixed cmnt:z-40 cmnt:top-0 cmnt:right-0 cmnt:bottom-0 cmnt:w-[360px] cmnt:max-w-[calc(100vw-16px)] cmnt:bg-white cmnt:border-l cmnt:border-gray-200 cmnt:flex cmnt:flex-col cmnt:pointer-events-auto cmnt:shadow-[-8px_0_24px_rgba(0,0,0,0.12)]"
        >
          {state.view === 'detail' && state.detailThreadId ? (
            <>
              <div className="cmnt:flex cmnt:items-center cmnt:justify-between cmnt:px-3 cmnt:py-2 cmnt:border-b cmnt:border-gray-200">
                <button
                  type="button"
                  onClick={() => panel.back()}
                  aria-label="Back"
                  className="cmnt:flex cmnt:items-center cmnt:gap-1 cmnt:bg-transparent cmnt:border-0 cmnt:cursor-pointer cmnt:text-sm cmnt:text-gray-700 cmnt:px-1"
                >
                  <span aria-hidden={true}>‹</span> Back
                </button>
                <Dialog.Title className="cmnt:sr-only">Thread</Dialog.Title>
                <Dialog.Description className="cmnt:sr-only">Thread detail</Dialog.Description>
                <Dialog.Close asChild>
                  <Button variant="ghost" size="icon" aria-label="Close panel">
                    ✕
                  </Button>
                </Dialog.Close>
              </div>
              <DetailView
                threadId={state.detailThreadId}
                listItem={detailItem}
                client={client}
                identity={identity}
                onNeedIdentity={onNeedIdentity}
              />
            </>
          ) : (
            <>
              <div className="cmnt:flex cmnt:items-center cmnt:justify-between cmnt:px-3 cmnt:py-2 cmnt:border-b cmnt:border-gray-200">
                <Dialog.Title className="cmnt:text-sm cmnt:font-semibold cmnt:text-gray-900">
                  Comments
                </Dialog.Title>
                <Dialog.Description className="cmnt:sr-only">
                  Comment threads across all pages
                </Dialog.Description>
                <Dialog.Close asChild>
                  <Button variant="ghost" size="icon" aria-label="Close panel">
                    ✕
                  </Button>
                </Dialog.Close>
              </div>

              <fieldset className="cmnt:m-0 cmnt:p-0 cmnt:border-0 cmnt:min-w-0">
                <legend className="cmnt:sr-only">Filter threads</legend>
                <div className="cmnt:flex cmnt:gap-1 cmnt:px-3 cmnt:py-2 cmnt:border-b cmnt:border-gray-200">
                  {FILTERS.map((f) => (
                    <button
                      key={f.value}
                      type="button"
                      aria-pressed={state.filter === f.value}
                      onClick={() => void panel.setFilter(f.value)}
                      className={cn(
                        'cmnt:rounded-full cmnt:px-3 cmnt:py-1 cmnt:text-xs cmnt:font-medium cmnt:border cmnt:cursor-pointer',
                        state.filter === f.value
                          ? 'cmnt:bg-blue-600 cmnt:text-white cmnt:border-blue-600'
                          : 'cmnt:bg-white cmnt:text-gray-600 cmnt:border-gray-200',
                      )}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </fieldset>

              <div className="cmnt:flex cmnt:items-center cmnt:justify-between cmnt:px-3 cmnt:py-2 cmnt:border-b cmnt:border-gray-200">
                <span className="cmnt:text-xs cmnt:text-gray-500">Show resolved pins on page</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={showResolved}
                  aria-label="Show resolved threads"
                  onClick={() => threads.setShowResolved(!showResolved)}
                  className="cmnt:inline-flex cmnt:items-center cmnt:bg-transparent cmnt:border-0 cmnt:cursor-pointer cmnt:p-0"
                >
                  <span
                    aria-hidden={true}
                    className={cn(
                      'cmnt:w-7 cmnt:h-4 cmnt:rounded-full cmnt:relative cmnt:transition-colors',
                      showResolved ? 'cmnt:bg-blue-600' : 'cmnt:bg-gray-300',
                    )}
                  >
                    <span
                      className={cn(
                        'cmnt:absolute cmnt:top-0.5 cmnt:w-3 cmnt:h-3 cmnt:rounded-full cmnt:bg-white cmnt:transition-all',
                        showResolved ? 'cmnt:left-[14px]' : 'cmnt:left-0.5',
                      )}
                    />
                  </span>
                </button>
              </div>

              <div className="cmnt:flex-1 cmnt:overflow-y-auto">
                {state.needsReview.length > 0 && (
                  <div data-testid="comments-needs-review">
                    <div className="cmnt:px-3 cmnt:py-1.5 cmnt:text-[11px] cmnt:font-semibold cmnt:text-amber-700 cmnt:bg-amber-50">
                      ⚠ Needs review ({state.needsReview.length})
                    </div>
                    {state.needsReview.map((t) => (
                      <PanelRow
                        key={t.id}
                        item={t}
                        onSelect={() => onSelect(t)}
                        onReply={() => onSelect(t)}
                        onResolve={() =>
                          void threads.setStatus(
                            t.id,
                            t.status === 'resolved' ? 'open' : 'resolved',
                          )
                        }
                      />
                    ))}
                    <div className="cmnt:h-px cmnt:bg-gray-200" />
                  </div>
                )}

                {state.loading && (
                  <div
                    data-testid="comments-panel-loading"
                    className="cmnt:px-3 cmnt:py-6 cmnt:text-center cmnt:text-xs cmnt:text-gray-400"
                  >
                    Loading…
                  </div>
                )}

                {state.error && !state.loading && (
                  <div className="cmnt:px-3 cmnt:py-6 cmnt:text-center cmnt:text-xs cmnt:text-gray-500">
                    Couldn't load comments.
                    <Button
                      variant="link"
                      size="inline"
                      onClick={() => void panel.refresh()}
                      className="cmnt:ml-1 cmnt:font-normal cmnt:underline"
                    >
                      Retry
                    </Button>
                  </div>
                )}

                {!state.loading &&
                  !state.error &&
                  mainList.length === 0 &&
                  state.needsReview.length === 0 && (
                    <div
                      data-testid="comments-panel-empty"
                      className="cmnt:px-3 cmnt:py-6 cmnt:text-center cmnt:text-xs cmnt:text-gray-400"
                    >
                      No comments yet
                    </div>
                  )}

                {mainList.map((t) => (
                  <PanelRow
                    key={t.id}
                    item={t}
                    onSelect={() => onSelect(t)}
                    onReply={() => onSelect(t)}
                    onResolve={() =>
                      void threads.setStatus(t.id, t.status === 'resolved' ? 'open' : 'resolved')
                    }
                  />
                ))}

                {state.nextCursor && (
                  <Button
                    variant="link"
                    size="inline"
                    data-testid="comments-panel-loadmore"
                    onClick={() => void panel.loadMore()}
                    disabled={state.loadingMore}
                    className="cmnt:w-full cmnt:py-2.5 cmnt:text-xs cmnt:border-t cmnt:border-gray-200 cmnt:hover:no-underline"
                  >
                    {state.loadingMore ? 'Loading…' : 'Load more'}
                  </Button>
                )}
              </div>
            </>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
