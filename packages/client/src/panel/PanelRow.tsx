// packages/client/src/panel/PanelRow.tsx
import type { ThreadListItem } from '@comments/core'
import { cn } from '../lib/cn'
import { relativeTime } from '../threads/relativeTime'

export type PanelRowProps = { item: ThreadListItem; onSelect: () => void }

export function PanelRow({ item, onSelect }: PanelRowProps) {
  const resolved = item.status === 'resolved'
  const orphaned = item.anchorState === 'orphaned'
  const label = `${resolved ? 'Resolved' : `${item.unresolvedCount} open`} comment thread on ${item.pageTitle ?? item.pageUrl}${orphaned ? ', anchor lost' : ''}`
  return (
    <button
      type="button"
      data-testid="comments-panel-row"
      data-thread-id={item.id}
      aria-label={label}
      onClick={onSelect}
      className="cmnt:w-full cmnt:flex cmnt:items-start cmnt:gap-2 cmnt:px-3 cmnt:py-2.5 cmnt:text-left cmnt:bg-transparent cmnt:border-0 cmnt:border-b cmnt:border-[#f1f3f5] cmnt:cursor-pointer cmnt:hover:bg-gray-50"
    >
      <span
        aria-hidden={true}
        className={cn(
          'cmnt:mt-1 cmnt:w-2 cmnt:h-2 cmnt:rounded-full cmnt:shrink-0',
          resolved ? 'cmnt:bg-gray-400' : 'cmnt:bg-blue-600',
        )}
      />
      <span className="cmnt:flex-1 cmnt:min-w-0">
        <span className="cmnt:block cmnt:text-[13px] cmnt:text-gray-900 cmnt:truncate">
          {item.pageTitle ?? item.pageUrl}
        </span>
        <span className="cmnt:mt-0.5 cmnt:flex cmnt:items-center cmnt:gap-1.5 cmnt:text-[11px] cmnt:text-gray-500">
          <span>{resolved ? 'Resolved' : `${item.unresolvedCount} open`}</span>
          <span aria-hidden={true}>·</span>
          <span>{relativeTime(item.updatedAt)}</span>
          {orphaned && (
            <span className="cmnt:ml-1 cmnt:px-1.5 cmnt:py-0.5 cmnt:rounded cmnt:bg-amber-100 cmnt:text-amber-700 cmnt:font-medium">
              <span aria-hidden={true}>⚠</span> anchor lost
            </span>
          )}
        </span>
      </span>
    </button>
  )
}
