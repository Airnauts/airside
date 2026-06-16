// packages/client/src/panel/PanelRow.tsx
import type { ThreadListItem } from '@airnauts/comments-core'
import { useEffect, useRef, useState } from 'react'
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

  const [copied, setCopied] = useState(false)
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => () => clearTimeout(copiedTimer.current), [])

  const onCopy = () => {
    void navigator.clipboard?.writeText(threadLink(item.pageUrl, item.id))?.catch(() => {})
    setCopied(true)
    clearTimeout(copiedTimer.current)
    copiedTimer.current = setTimeout(() => setCopied(false), 1000)
  }

  return (
    <div data-thread-id={item.id} className="air:border-b air:border-[#f1f3f5]">
      <button
        type="button"
        data-testid="comments-panel-row"
        onClick={onSelect}
        aria-label={`Open thread on ${context}`}
        className="air:w-full air:flex air:items-start air:gap-2 air:px-3 air:pt-2.5 air:pb-1 air:text-left air:bg-transparent air:border-0 air:cursor-pointer air:hover:bg-gray-50"
      >
        <span
          aria-hidden={true}
          className="air:shrink-0 air:w-[26px] air:h-[26px] air:rounded-full air:text-white air:flex air:items-center air:justify-center air:text-[11px] air:font-semibold"
          style={{ backgroundColor: avatarColor(author.email) }}
        >
          {initials(author)}
        </span>
        <span className="air:flex-1 air:min-w-0">
          <span className="air:flex air:items-center air:gap-1.5">
            <b className="air:text-xs air:truncate">{author.name ?? author.email}</b>
            <span className="air:text-gray-400 air:text-[11px]">
              {relativeTime(item.updatedAt)}
            </span>
            {orphaned && (
              <span className="air:ml-1 air:px-1.5 air:py-0.5 air:rounded-[4px] air:bg-amber-100 air:text-amber-700 air:font-medium air:text-[11px]">
                <span aria-hidden={true}>⚠</span> anchor lost
              </span>
            )}
          </span>
          <span className="air:mt-0.5 air:block air:text-[13px] air:text-gray-900 air:truncate">
            {rootText !== '' ? rootText : <span className="air:text-gray-400">📎 Attachment</span>}
          </span>
          <span className="air:mt-0.5 air:block air:text-[11px] air:text-gray-400 air:truncate">
            {context}
          </span>
        </span>
      </button>
      <div className="air:px-3 air:pb-2 air:pl-[46px] air:flex air:items-center">
        {replies > 0 ? (
          <Button
            variant="link"
            size="inline"
            onClick={onSelect}
            className="air:text-[11px] air:text-gray-500"
          >
            {replies} {replies === 1 ? 'Reply' : 'Replies'}
          </Button>
        ) : (
          <Button variant="link" size="inline" onClick={onReply} className="air:text-[11px]">
            Reply
          </Button>
        )}
        <Button
          variant="link"
          size="inline"
          onClick={onResolve}
          aria-label={item.status === 'resolved' ? 'Reopen thread' : 'Resolve thread'}
          className="air:ml-3 air:text-[11px] air:font-semibold air:text-green-600"
        >
          {item.status === 'resolved' ? '↺ Reopen' : '✓ Resolve'}
        </Button>
        <Button
          variant="link"
          size="inline"
          aria-label="Copy link"
          onClick={onCopy}
          className="air:ml-3 air:text-[11px] air:text-gray-500"
        >
          {copied ? 'Copied!' : 'Copy link'}
        </Button>
      </div>
    </div>
  )
}
