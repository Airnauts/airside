// packages/client/src/ui/Pin.tsx
import type { ThreadListItem } from '@airnauts/comments-core'
import { type ComponentPropsWithoutRef, forwardRef } from 'react'
import { cn } from '../lib/cn'
import type { XY } from '../positioning/coords'
import { initials } from './avatar'

export type PinProps = {
  item: ThreadListItem
  pin: XY
  onOpen?: () => void
  focused?: boolean
} & ComponentPropsWithoutRef<'button'>

/** The teardrop pin: solid-blue avatar, white ring, dark count pill. Resolved → grey + check. */
export const Pin = forwardRef<HTMLButtonElement, PinProps>(function Pin(
  { item, pin, onOpen, onClick, className, style, focused, ...rest },
  ref,
) {
  const resolved = item.status === 'resolved'
  const label = resolved
    ? `Resolved comment thread by ${item.createdBy.name ?? item.createdBy.email}`
    : `Comment thread by ${item.createdBy.name ?? item.createdBy.email}, ${item.commentCount} ${item.commentCount === 1 ? 'comment' : 'comments'}`
  return (
    <button
      // Radix's <Popover.Trigger asChild> injects its own onClick/aria/data-state/ref here.
      // Spread those first, then set our explicit attributes so they win.
      {...rest}
      ref={ref}
      type="button"
      data-comments-pin
      data-comments-pin-id={item.id}
      data-testid="comments-pin"
      data-focused={focused ? 'true' : undefined}
      aria-label={label}
      // compose: Radix's toggle (onClick) AND the optional onOpen both fire
      onClick={(e) => {
        onClick?.(e)
        onOpen?.()
      }}
      // tip of the teardrop points at the anchor (-mt-[42px]); transform is computed → inline
      className={cn(
        'cmnt:absolute cmnt:w-[42px] cmnt:h-[42px] cmnt:-ml-[21px] cmnt:-mt-[42px] cmnt:p-0 cmnt:border-none cmnt:bg-transparent cmnt:cursor-pointer cmnt:pointer-events-auto',
        className,
      )}
      style={{ transform: `translate(${pin.x}px, ${pin.y}px)`, ...style }}
    >
      {focused && (
        <span
          aria-hidden={true}
          data-testid="comments-pin-pulse"
          className="cmnt:absolute cmnt:inset-0 cmnt:rounded-full cmnt:bg-blue-500/40 cmnt:animate-ping"
        />
      )}
      <span
        aria-hidden={true}
        className={cn(
          'cmnt:absolute cmnt:inset-0 cmnt:border-2 cmnt:border-white cmnt:shadow-lg',
          resolved ? 'cmnt:bg-gray-400' : 'cmnt:bg-blue-600',
        )}
        // one-off teardrop shape (no utility) → inline
        style={{ borderRadius: '50% 50% 50% 0', transform: 'rotate(-45deg)' }}
      />
      <span
        aria-hidden={true}
        className={cn(
          'cmnt:absolute cmnt:top-1.5 cmnt:left-1.5 cmnt:w-[30px] cmnt:h-[30px] cmnt:rounded-full cmnt:border-2 cmnt:border-white cmnt:flex cmnt:items-center cmnt:justify-center cmnt:font-semibold',
          resolved
            ? 'cmnt:bg-white cmnt:text-green-600 cmnt:text-base'
            : 'cmnt:bg-blue-600 cmnt:text-white cmnt:text-xs',
        )}
      >
        {resolved ? '✓' : initials(item.createdBy)}
      </span>
      {!resolved && item.commentCount > 0 && (
        <span
          aria-hidden={true}
          className="cmnt:absolute cmnt:-top-1.5 cmnt:-right-[7px] cmnt:min-w-[22px] cmnt:h-[22px] cmnt:rounded-[11px] cmnt:bg-gray-900 cmnt:text-white cmnt:text-[11px] cmnt:font-bold cmnt:flex cmnt:items-center cmnt:justify-center cmnt:px-[5px] cmnt:border-2 cmnt:border-white cmnt:leading-[0]"
        >
          {item.commentCount}
        </span>
      )}
    </button>
  )
})
