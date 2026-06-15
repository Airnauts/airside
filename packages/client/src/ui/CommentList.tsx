// packages/client/src/ui/CommentList.tsx
import type { Comment } from '@airnauts/comments-core'
import { useEffect, useRef } from 'react'
import { relativeTime } from '../threads/relativeTime'
import { avatarColor, initials } from './avatar'
import { StatusNotice } from './StatusNotice'

export type CommentListProps = {
  comments: Comment[]
  loading: boolean
  error: boolean
  onRetry?: () => void
  /**
   * popover: cap the list at a fixed height so the floating pin popover stays compact.
   * sidebar: flex to fill the drawer's remaining height (scrolls within that space).
   */
  variant?: 'popover' | 'sidebar'
}

export function CommentList({
  comments,
  loading,
  error,
  onRetry,
  variant = 'popover',
}: CommentListProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  // Keep the most recent comment in view: when a message is added (or the
  // thread first opens), pin the list to the bottom.
  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll on count change, not on the array identity
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [comments.length])

  if (error) {
    return (
      <StatusNotice
        onRetry={onRetry}
        className="cmnt:p-3 cmnt:text-left cmnt:text-[13px] cmnt:text-gray-500"
      >
        Couldn't load this thread.
      </StatusNotice>
    )
  }
  if (loading) {
    return (
      <div
        data-testid="comments-skeleton"
        role="status"
        aria-busy="true"
        aria-label="Loading comments"
        className="cmnt:p-3"
      >
        {[0, 1].map((i) => (
          <div key={i} className="cmnt:flex cmnt:gap-[9px] cmnt:mb-3.5">
            <div className="cmnt:w-[26px] cmnt:h-[26px] cmnt:rounded-full cmnt:bg-gray-200" />
            <div className="cmnt:flex-1">
              <div className="cmnt:w-2/5 cmnt:h-2.5 cmnt:bg-gray-200 cmnt:rounded-[4px]" />
              <div className="cmnt:w-[85%] cmnt:h-2.5 cmnt:bg-gray-100 cmnt:rounded-[4px] cmnt:mt-1.5" />
            </div>
          </div>
        ))}
      </div>
    )
  }
  if (comments.length === 0) {
    return (
      <StatusNotice className="cmnt:py-4 cmnt:text-[13px]">
        <span aria-hidden="true">💬</span> No comments yet — start the thread.
      </StatusNotice>
    )
  }
  return (
    <div
      ref={scrollRef}
      data-testid="comment-list-scroll"
      className={
        variant === 'sidebar'
          ? // Size to content so the composer hugs the last message (no empty gap), but keep
            // min-h-0 + overflow so a long thread shrinks and scrolls within the drawer instead
            // of pushing the composer off-screen. NOT flex-1 — that stretched the list to fill
            // the drawer and pinned the composer to the bottom.
            'cmnt:min-h-0 cmnt:overflow-auto cmnt:p-3'
          : 'cmnt:max-h-[230px] cmnt:overflow-auto cmnt:p-3'
      }
    >
      {comments.map((c) => (
        <div key={c.id} className="cmnt:flex cmnt:gap-[9px] cmnt:mb-3.5">
          <div
            aria-hidden
            className="cmnt:shrink-0 cmnt:w-[26px] cmnt:h-[26px] cmnt:rounded-full cmnt:text-white cmnt:flex cmnt:items-center cmnt:justify-center cmnt:text-[11px] cmnt:font-semibold"
            style={{ backgroundColor: avatarColor(c.author.email) }} // per-author color is computed → inline
          >
            {initials(c.author)}
          </div>
          <div className="cmnt:min-w-0">
            <div className="cmnt:flex cmnt:gap-1.5 cmnt:items-baseline">
              <b className="cmnt:text-xs">{c.author.name ?? c.author.email}</b>
              <span className="cmnt:text-gray-400 cmnt:text-[11px]">
                {relativeTime(c.createdAt)}
              </span>
            </div>
            <div className="cmnt:mt-0.5 cmnt:leading-relaxed cmnt:text-[13px] cmnt:whitespace-pre-wrap">
              {c.text}
            </div>
            {c.attachments.map((a) => (
              <a
                key={a.id}
                href={a.url}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`Open ${a.name} in a new tab`}
                title="Open in new tab"
                className="cmnt:group cmnt:relative cmnt:mt-1.5 cmnt:block cmnt:w-max cmnt:rounded-lg cmnt:border cmnt:border-slate-300 cmnt:overflow-hidden"
              >
                <img src={a.url} alt={a.name} className="cmnt:max-w-[160px] cmnt:block" />
                <span
                  aria-hidden
                  className="cmnt:absolute cmnt:top-1 cmnt:right-1 cmnt:flex cmnt:items-center cmnt:justify-center cmnt:w-5 cmnt:h-5 cmnt:rounded-[4px] cmnt:bg-black/55 cmnt:text-white cmnt:opacity-80 cmnt:group-hover:opacity-100 cmnt:transition-opacity"
                >
                  <svg
                    viewBox="0 0 24 24"
                    width="12"
                    height="12"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <title>Open in new tab</title>
                    <path d="M15 3h6v6" />
                    <path d="M10 14 21 3" />
                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                  </svg>
                </span>
              </a>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
