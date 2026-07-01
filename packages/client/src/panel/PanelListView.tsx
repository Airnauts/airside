// packages/client/src/panel/PanelListView.tsx

import type { Provenance } from '@airnauts/airside-core'
import * as Dialog from '@radix-ui/react-dialog'
import { useState } from 'react'
import type { ApiClient } from '../api/client'
import { cn } from '../lib/cn'
import { useCreateThread } from '../threads/useCreateThread'
import { useController, useShowResolved } from '../threads/useThreads'
import { Button } from '../ui/Button'
import { Composer } from '../ui/Composer'
import { StatusNotice } from '../ui/StatusNotice'
import { usePanelController, usePanelState } from './PanelProvider'
import { PanelRow } from './PanelRow'
import { mainListExcludingReview, type PanelFilter } from './state'

const FILTERS: { value: PanelFilter; label: string }[] = [
  { value: 'open', label: 'Open' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'all', label: 'All' },
]

export type PanelListViewProps = {
  onSelect: (row: { id: string; pageKey: string | null; pageUrl: string }) => void
  /** Create a page-level comment straight from the list (no pin) + upload for its composer. */
  client: Pick<ApiClient, 'createThread' | 'upload'>
  /** Resolve the current URL to its page key so a page comment is scoped to this page. */
  resolvePageKey: (url: string) => string
  provenance?: Provenance
}

/** The drawer's list pane: header, filter chips, resolved-pins toggle and thread rows. */
export function PanelListView({
  onSelect,
  client,
  resolvePageKey,
  provenance,
}: PanelListViewProps) {
  const state = usePanelState()
  const panel = usePanelController()
  const threads = useController()
  const showResolved = useShowResolved()
  const mainList = mainListExcludingReview(state)

  const [composing, setComposing] = useState(false)
  const createPageComment = useCreateThread({
    client,
    pageKey: resolvePageKey(window.location.href),
    provenance,
  })
  // A page-level comment carries no anchor; on success open its detail in the panel (it has no
  // on-page pin, so the panel is its only surface).
  const submitPageComment = async (payload: Parameters<typeof createPageComment>[0]) => {
    const created = await createPageComment(payload)
    if (!created) return
    setComposing(false)
    panel.openDetail(created.id)
  }

  const toggleResolve = (t: { id: string; status: string }) =>
    void threads.setStatus(t.id, t.status === 'resolved' ? 'open' : 'resolved')

  const renderRow = (t: (typeof mainList)[number]) => (
    <PanelRow
      key={t.id}
      item={t}
      onSelect={() => onSelect(t)}
      onReply={() => onSelect(t)}
      onResolve={() => toggleResolve(t)}
    />
  )

  return (
    <>
      <div className="air:flex air:items-center air:justify-between air:px-3 air:py-2 air:border-b air:border-gray-200">
        <Dialog.Title className="air:text-sm air:font-semibold air:text-gray-900">
          Comments
        </Dialog.Title>
        <Dialog.Description className="air:sr-only">
          Comment threads across all pages
        </Dialog.Description>
        <Dialog.Close asChild>
          <Button variant="ghost" size="icon" aria-label="Close panel">
            ✕
          </Button>
        </Dialog.Close>
      </div>

      <fieldset className="air:m-0 air:p-0 air:border-0 air:min-w-0">
        <legend className="air:sr-only">Filter threads</legend>
        <div className="air:flex air:gap-1 air:px-3 air:py-2 air:border-b air:border-gray-200">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              aria-pressed={state.filter === f.value}
              onClick={() => void panel.setFilter(f.value)}
              className={cn(
                'air:rounded-full air:px-3 air:py-1 air:text-xs air:font-medium air:border air:cursor-pointer',
                state.filter === f.value
                  ? 'air:bg-blue-600 air:text-white air:border-blue-600'
                  : 'air:bg-white air:text-gray-600 air:border-gray-200',
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </fieldset>

      <div className="air:px-3 air:py-2 air:border-b air:border-gray-200">
        {composing ? (
          <div
            data-testid="airside-page-composer"
            className="air:border air:border-gray-200 air:rounded-lg air:overflow-hidden"
          >
            <Composer
              mode="newThread"
              upload={client.upload}
              autoFocus
              onCancel={() => setComposing(false)}
              onSubmit={submitPageComment}
            />
          </div>
        ) : (
          <Button
            variant="outline"
            size="sm"
            data-testid="airside-page-comment"
            onClick={() => setComposing(true)}
            className="air:w-full air:justify-center"
          >
            ＋ Comment on this page
          </Button>
        )}
      </div>

      <div className="air:flex air:items-center air:justify-between air:px-3 air:py-2 air:border-b air:border-gray-200">
        <span className="air:text-xs air:text-gray-500">Show resolved pins on page</span>
        <button
          type="button"
          role="switch"
          aria-checked={showResolved}
          aria-label="Show resolved threads"
          onClick={() => threads.setShowResolved(!showResolved)}
          className="air:inline-flex air:items-center air:bg-transparent air:border-0 air:cursor-pointer air:p-0"
        >
          <span
            aria-hidden={true}
            className={cn(
              'air:w-7 air:h-4 air:rounded-full air:relative air:transition-colors',
              showResolved ? 'air:bg-blue-600' : 'air:bg-gray-300',
            )}
          >
            <span
              className={cn(
                'air:absolute air:top-0.5 air:w-3 air:h-3 air:rounded-full air:bg-white air:transition-all',
                showResolved ? 'air:left-[14px]' : 'air:left-0.5',
              )}
            />
          </span>
        </button>
      </div>

      <div className="air:flex-1 air:overflow-y-auto">
        {state.needsReview.length > 0 && (
          <div data-testid="airside-needs-review">
            <div className="air:px-3 air:py-1.5 air:text-[11px] air:font-semibold air:text-amber-700 air:bg-amber-50">
              ⚠ Needs review ({state.needsReview.length})
            </div>
            {state.needsReview.map(renderRow)}
            <div className="air:h-px air:bg-gray-200" />
          </div>
        )}

        {state.loading && <StatusNotice data-testid="airside-panel-loading">Loading…</StatusNotice>}

        {state.error && !state.loading && (
          <StatusNotice className="air:text-gray-500" onRetry={() => void panel.refresh()}>
            Couldn't load comments.
          </StatusNotice>
        )}

        {!state.loading &&
          !state.error &&
          mainList.length === 0 &&
          state.needsReview.length === 0 && (
            <StatusNotice data-testid="airside-panel-empty">No comments yet</StatusNotice>
          )}

        {mainList.map(renderRow)}

        {state.nextCursor && (
          <Button
            variant="link"
            size="inline"
            data-testid="airside-panel-loadmore"
            onClick={() => void panel.loadMore()}
            disabled={state.loadingMore}
            className="air:w-full air:py-2.5 air:text-xs air:border-t air:border-gray-200 air:hover:no-underline"
          >
            {state.loadingMore ? 'Loading…' : 'Load more'}
          </Button>
        )}
      </div>
    </>
  )
}
