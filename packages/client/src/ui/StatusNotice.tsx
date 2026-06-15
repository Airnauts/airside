// packages/client/src/ui/StatusNotice.tsx
import type { ReactNode } from 'react'
import { cn } from '../lib/cn'
import { Button } from './Button'

export type StatusNoticeProps = {
  children: ReactNode
  /** Renders an inline Retry link after the message. */
  onRetry?: () => void
  /** Merged last — callers override tone/size/alignment per surface. */
  className?: string
  'data-testid'?: string
}

/** Inline status row (loading / error / empty) with an optional Retry action. */
export function StatusNotice({
  children,
  onRetry,
  className,
  'data-testid': testId,
}: StatusNoticeProps) {
  return (
    <div
      data-testid={testId}
      className={cn(
        'cmnt:px-3 cmnt:py-6 cmnt:text-center cmnt:text-xs cmnt:text-gray-400',
        className,
      )}
    >
      {children}
      {onRetry && (
        <Button
          variant="link"
          size="inline"
          onClick={onRetry}
          className="cmnt:ml-1 cmnt:font-normal cmnt:underline"
        >
          Retry
        </Button>
      )}
    </div>
  )
}
