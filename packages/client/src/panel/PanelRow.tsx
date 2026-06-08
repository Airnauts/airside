// packages/client/src/panel/PanelRow.tsx
import type { ThreadListItem } from '@airnauts/comments-core'
import { threadLink } from '../config'
import { relativeTime } from '../threads/relativeTime'
import { avatarColor, initials } from '../ui/avatar'
import { Button } from '../ui/Button'

export type PanelRowProps = {
  item: ThreadListItem
  onSelect: () => void
  onReply: () => void
  onResolve: () => void
}

export function PanelRow({ item, onSelect, onReply, onResolve }: PanelRowProps) {
  const orphaned = item.anchorState === 'orphaned'
  const replies = Math.max(0, item.commentCount - 1)
  const rootText = item.rootComment?.text ?? ''
  const author = item.createdBy
  const context = item.pageTitle ?? item.pageUrl

  return (
    <div data-thread-id={item.id} className="cmnt:border-b cmnt:border-[#f1f3f5]">
      <button
        type="button"
        data-testid="comments-panel-row"
        onClick={onSelect}
        aria-label={`Open thread on ${context}`}
        className="cmnt:w-full cmnt:flex cmnt:items-start cmnt:gap-2 cmnt:px-3 cmnt:pt-2.5 cmnt:pb-1 cmnt:text-left cmnt:bg-transparent cmnt:border-0 cmnt:cursor-pointer cmnt:hover:bg-gray-50"
      >
        <span
          aria-hidden={true}
          className="cmnt:shrink-0 cmnt:w-[26px] cmnt:h-[26px] cmnt:rounded-full cmnt:text-white cmnt:flex cmnt:items-center cmnt:justify-center cmnt:text-[11px] cmnt:font-semibold"
          style={{ backgroundColor: avatarColor(author.email) }}
        >
          {initials(author)}
        </span>
        <span className="cmnt:flex-1 cmnt:min-w-0">
          <span className="cmnt:flex cmnt:items-center cmnt:gap-1.5">
            <b className="cmnt:text-xs cmnt:truncate">{author.name ?? author.email}</b>
            <span className="cmnt:text-gray-400 cmnt:text-[11px]">
              {relativeTime(item.updatedAt)}
            </span>
            {orphaned && (
              <span className="cmnt:ml-1 cmnt:px-1.5 cmnt:py-0.5 cmnt:rounded-[4px] cmnt:bg-amber-100 cmnt:text-amber-700 cmnt:font-medium cmnt:text-[11px]">
                <span aria-hidden={true}>⚠</span> anchor lost
              </span>
            )}
          </span>
          <span className="cmnt:mt-0.5 cmnt:block cmnt:text-[13px] cmnt:text-gray-900 cmnt:truncate">
            {rootText !== '' ? rootText : <span className="cmnt:text-gray-400">📎 Attachment</span>}
          </span>
          <span className="cmnt:mt-0.5 cmnt:block cmnt:text-[11px] cmnt:text-gray-400 cmnt:truncate">
            {context}
          </span>
        </span>
      </button>
      <div className="cmnt:px-3 cmnt:pb-2 cmnt:pl-[46px] cmnt:flex cmnt:items-center">
        {replies > 0 ? (
          <Button
            variant="link"
            size="inline"
            onClick={onSelect}
            className="cmnt:text-[11px] cmnt:text-gray-500"
          >
            {replies} {replies === 1 ? 'Reply' : 'Replies'}
          </Button>
        ) : (
          <Button variant="link" size="inline" onClick={onReply} className="cmnt:text-[11px]">
            Reply
          </Button>
        )}
        <Button
          variant="link"
          size="inline"
          onClick={onResolve}
          aria-label={item.status === 'resolved' ? 'Reopen thread' : 'Resolve thread'}
          className="cmnt:ml-3 cmnt:text-[11px] cmnt:font-semibold cmnt:text-green-600"
        >
          {item.status === 'resolved' ? '↺ Reopen' : '✓ Resolve'}
        </Button>
        <Button
          variant="link"
          size="inline"
          aria-label="Copy link"
          onClick={() =>
            void navigator.clipboard?.writeText(threadLink(item.pageUrl, item.id))?.catch(() => {})
          }
          className="cmnt:ml-3 cmnt:text-[11px] cmnt:text-gray-500"
        >
          Copy link
        </Button>
      </div>
    </div>
  )
}
