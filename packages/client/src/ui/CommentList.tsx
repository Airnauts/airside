// packages/client/src/ui/CommentList.tsx
import type { Comment } from '@airnauts/airside-core'
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
        className="air:p-3 air:text-left air:text-[13px] air:text-gray-500"
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
        className="air:p-3"
      >
        {[0, 1].map((i) => (
          <div key={i} className="air:flex air:gap-[9px] air:mb-3.5">
            <div className="air:w-[26px] air:h-[26px] air:rounded-full air:bg-gray-200" />
            <div className="air:flex-1">
              <div className="air:w-2/5 air:h-2.5 air:bg-gray-200 air:rounded-[4px]" />
              <div className="air:w-[85%] air:h-2.5 air:bg-gray-100 air:rounded-[4px] air:mt-1.5" />
            </div>
          </div>
        ))}
      </div>
    )
  }
  if (comments.length === 0) {
    return (
      <StatusNotice className="air:py-4 air:text-[13px]">
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
            'air:min-h-0 air:overflow-auto air:p-3'
          : 'air:max-h-[230px] air:overflow-auto air:p-3'
      }
    >
      {comments.map((c) => (
        <div key={c.id} className="air:flex air:gap-[9px] air:mb-3.5">
          <div
            aria-hidden
            className="air:shrink-0 air:w-[26px] air:h-[26px] air:rounded-full air:text-white air:flex air:items-center air:justify-center air:text-[11px] air:font-semibold"
            style={{ backgroundColor: avatarColor(c.author.email) }} // per-author color is computed → inline
          >
            {initials(c.author)}
          </div>
          <div className="air:min-w-0">
            <div className="air:flex air:gap-1.5 air:items-baseline">
              <b className="air:text-xs">{c.author.name ?? c.author.email}</b>
              <span className="air:text-gray-400 air:text-[11px]">
                {relativeTime(c.createdAt)}
              </span>
            </div>
            <div className="air:mt-0.5 air:leading-relaxed air:text-[13px] air:whitespace-pre-wrap">
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
                className="air:group air:relative air:mt-1.5 air:block air:w-max air:rounded-lg air:border air:border-slate-300 air:overflow-hidden"
              >
                <img src={a.url} alt={a.name} className="air:max-w-[160px] air:block" />
                <span
                  aria-hidden
                  className="air:absolute air:top-1 air:right-1 air:flex air:items-center air:justify-center air:w-5 air:h-5 air:rounded-[4px] air:bg-black/55 air:text-white air:opacity-80 air:group-hover:opacity-100 air:transition-opacity"
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
