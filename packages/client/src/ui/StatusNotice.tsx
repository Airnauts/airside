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
      className={cn('air:px-3 air:py-6 air:text-center air:text-xs air:text-gray-400', className)}
    >
      {children}
      {onRetry && (
        <Button
          variant="link"
          size="inline"
          onClick={onRetry}
          className="air:ml-1 air:font-normal air:underline"
        >
          Retry
        </Button>
      )}
    </div>
  )
}
