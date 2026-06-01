// packages/client/src/panel/PanelDrawer.tsx
import * as Dialog from '@radix-ui/react-dialog'
import { useEffect } from 'react'
import { usePortalContainer } from '../app/providers'
import { cn } from '../lib/cn'
import { useController } from '../threads/useThreads'
import { goToThread } from './navigate'
import { PanelRow } from './PanelRow'
import { usePanelController, usePanelState } from './PanelProvider'
import { mainListExcludingReview, type PanelFilter } from './state'

const FILTERS: { value: PanelFilter; label: string }[] = [
  { value: 'open', label: 'Open' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'all', label: 'All' },
]

export type PanelDrawerProps = {
  resolvePageKey: (url: string) => string
}

export function PanelDrawer({ resolvePageKey }: PanelDrawerProps) {
  const state = usePanelState()
  const panel = usePanelController()
  const threads = useController()
  const container = usePortalContainer()
  const mainList = mainListExcludingReview(state)

  // Drawer-open reconciliation: when a status change persists, refetch the current filter.
  useEffect(() => {
    if (!state.open) return
    threads.registerStatusListener(() => void panel.refresh())
    return () => threads.registerStatusListener(null)
  }, [state.open, threads, panel])

  function onSelect(row: { id: string; pageKey: string | null; pageUrl: string }) {
    const here = resolvePageKey(window.location.href)
    if (row.pageKey === here) {
      panel.closePanel()
      threads.requestFocus(row.id)
    } else {
      goToThread({ id: row.id, pageUrl: row.pageUrl })
    }
  }

  return (
    <Dialog.Root open={state.open} modal={false} onOpenChange={(o) => !o && panel.closePanel()}>
      <Dialog.Portal container={container ?? undefined}>
        <Dialog.Content
          data-testid="comments-panel"
          onInteractOutside={(e) => e.preventDefault()}
          className="cmnt:fixed cmnt:top-0 cmnt:right-0 cmnt:bottom-0 cmnt:w-[360px] cmnt:max-w-[calc(100vw-16px)] cmnt:bg-white cmnt:border-l cmnt:border-gray-200 cmnt:flex cmnt:flex-col cmnt:pointer-events-auto cmnt:shadow-[-8px_0_24px_rgba(0,0,0,0.12)]"
        >
          <div className="cmnt:flex cmnt:items-center cmnt:justify-between cmnt:px-3 cmnt:py-2.5 cmnt:border-b cmnt:border-gray-200">
            <Dialog.Title className="cmnt:text-sm cmnt:font-semibold cmnt:text-gray-900">
              Comments
            </Dialog.Title>
            <Dialog.Close
              aria-label="Close panel"
              className="cmnt:border-0 cmnt:bg-transparent cmnt:cursor-pointer cmnt:text-gray-500 cmnt:px-1"
            >
              ✕
            </Dialog.Close>
          </div>

          <div
            role="radiogroup"
            aria-label="Filter threads"
            className="cmnt:flex cmnt:gap-1 cmnt:px-3 cmnt:py-2 cmnt:border-b cmnt:border-gray-200"
          >
            {FILTERS.map((f) => (
              <button
                key={f.value}
                type="button"
                role="radio"
                aria-checked={state.filter === f.value}
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

          <div className="cmnt:flex-1 cmnt:overflow-y-auto">
            {state.needsReview.length > 0 && (
              <div data-testid="comments-needs-review">
                <div className="cmnt:px-3 cmnt:py-1.5 cmnt:text-[11px] cmnt:font-semibold cmnt:text-amber-700 cmnt:bg-amber-50">
                  ⚠ Needs review ({state.needsReview.length})
                </div>
                {state.needsReview.map((t) => (
                  <PanelRow key={t.id} item={t} onSelect={() => onSelect(t)} />
                ))}
                <div className="cmnt:h-px cmnt:bg-gray-200" />
              </div>
            )}

            {state.loading && (
              <div data-testid="comments-panel-loading" className="cmnt:px-3 cmnt:py-6 cmnt:text-center cmnt:text-xs cmnt:text-gray-400">
                Loading…
              </div>
            )}

            {state.error && !state.loading && (
              <div className="cmnt:px-3 cmnt:py-6 cmnt:text-center cmnt:text-xs cmnt:text-gray-500">
                Couldn&rsquo;t load comments.
                <button
                  type="button"
                  onClick={() => void panel.refresh()}
                  className="cmnt:ml-1 cmnt:underline cmnt:bg-transparent cmnt:border-0 cmnt:cursor-pointer cmnt:text-blue-600"
                >
                  Retry
                </button>
              </div>
            )}

            {!state.loading && !state.error && mainList.length === 0 && state.needsReview.length === 0 && (
              <div data-testid="comments-panel-empty" className="cmnt:px-3 cmnt:py-6 cmnt:text-center cmnt:text-xs cmnt:text-gray-400">
                No comments yet
              </div>
            )}

            {mainList.map((t) => (
              <PanelRow key={t.id} item={t} onSelect={() => onSelect(t)} />
            ))}

            {state.nextCursor && (
              <button
                type="button"
                data-testid="comments-panel-loadmore"
                onClick={() => void panel.loadMore()}
                disabled={state.loadingMore}
                className="cmnt:w-full cmnt:py-2.5 cmnt:text-xs cmnt:font-medium cmnt:text-blue-600 cmnt:bg-transparent cmnt:border-0 cmnt:border-t cmnt:border-gray-200 cmnt:cursor-pointer"
              >
                {state.loadingMore ? 'Loading…' : 'Load more'}
              </button>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
