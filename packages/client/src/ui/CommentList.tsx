// packages/client/src/ui/CommentList.tsx
import type { Comment } from '@comments/core'
import { relativeTime } from '../threads/relativeTime'
import { avatarColor, initials } from './avatar'

export type CommentListProps = {
  comments: Comment[]
  loading: boolean
  error: boolean
  onRetry?: () => void
}

const LINK =
  'cmnt:bg-transparent cmnt:border-none cmnt:text-blue-600 cmnt:cursor-pointer cmnt:p-0 cmnt:underline'

export function CommentList({ comments, loading, error, onRetry }: CommentListProps) {
  if (error) {
    return (
      <div className="cmnt:p-3 cmnt:text-[13px] cmnt:text-gray-500">
        Couldn't load this thread.{' '}
        <button type="button" onClick={onRetry} className={LINK}>
          Retry
        </button>
      </div>
    )
  }
  if (loading) {
    return (
      <div data-testid="comments-skeleton" className="cmnt:p-3">
        {[0, 1].map((i) => (
          <div key={i} className="cmnt:flex cmnt:gap-[9px] cmnt:mb-3.5">
            <div className="cmnt:w-[26px] cmnt:h-[26px] cmnt:rounded-full cmnt:bg-gray-200" />
            <div className="cmnt:flex-1">
              <div className="cmnt:w-2/5 cmnt:h-2.5 cmnt:bg-gray-200 cmnt:rounded" />
              <div className="cmnt:w-[85%] cmnt:h-2.5 cmnt:bg-gray-100 cmnt:rounded cmnt:mt-1.5" />
            </div>
          </div>
        ))}
      </div>
    )
  }
  if (comments.length === 0) {
    return (
      <div className="cmnt:px-3 cmnt:py-4 cmnt:text-gray-400 cmnt:text-center cmnt:text-[13px]">
        💬 No comments yet — start the thread.
      </div>
    )
  }
  return (
    <div className="cmnt:max-h-[230px] cmnt:overflow-auto cmnt:p-3">
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
              <img
                key={a.id}
                src={a.url}
                alt={a.name}
                className="cmnt:mt-1.5 cmnt:max-w-[160px] cmnt:rounded-lg cmnt:border cmnt:border-slate-300 cmnt:block"
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
