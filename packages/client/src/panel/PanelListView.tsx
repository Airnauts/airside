// packages/client/src/panel/PanelListView.tsx

import * as Dialog from '@radix-ui/react-dialog'
import { cn } from '../lib/cn'
import { useController, useShowResolved } from '../threads/useThreads'
import { Button } from '../ui/Button'
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
}

/** The drawer's list pane: header, filter chips, resolved-pins toggle and thread rows. */
export function PanelListView({ onSelect }: PanelListViewProps) {
  const state = usePanelState()
  const panel = usePanelController()
  const threads = useController()
  const showResolved = useShowResolved()
  const mainList = mainListExcludingReview(state)

  const toggleResolve = (t: { id: string; status: string }) =>
    void threads.setStatus(t.id, t.status === 'resolved' ? 'open' : 'resolved')

  return (
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
                onResolve={() => toggleResolve(t)}
              />
            ))}
            <div className="cmnt:h-px cmnt:bg-gray-200" />
          </div>
        )}

        {state.loading && (
          <StatusNotice data-testid="comments-panel-loading">Loading…</StatusNotice>
        )}

        {state.error && !state.loading && (
          <StatusNotice className="cmnt:text-gray-500" onRetry={() => void panel.refresh()}>
            Couldn't load comments.
          </StatusNotice>
        )}

        {!state.loading &&
          !state.error &&
          mainList.length === 0 &&
          state.needsReview.length === 0 && (
            <StatusNotice data-testid="comments-panel-empty">No comments yet</StatusNotice>
          )}

        {mainList.map((t) => (
          <PanelRow
            key={t.id}
            item={t}
            onSelect={() => onSelect(t)}
            onReply={() => onSelect(t)}
            onResolve={() => toggleResolve(t)}
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
  )
}
