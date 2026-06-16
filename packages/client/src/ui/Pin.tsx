// packages/client/src/ui/Pin.tsx
import type { ThreadListItem } from '@airnauts/comments-core'
import { type ComponentPropsWithoutRef, forwardRef } from 'react'
import { cn } from '../lib/cn'
import type { XY } from '../positioning/coords'
import { initials } from './avatar'

/** The pin's one-off teardrop shape (no Tailwind utility) — shared with the draft preview pin. */
export const TEARDROP_STYLE = {
  borderRadius: '50% 50% 50% 0',
  transform: 'rotate(-45deg)',
} as const

export type PinProps = {
  item: ThreadListItem
  pin: XY
  onOpen?: () => void
  focused?: boolean
  /**
   * The pin's thread is the active one — its popover is open, or it's the thread selected in the
   * sidebar panel. Active pins reverse to a white body with blue initials/outline and rise above
   * neighbouring pins (z-index). Driven by a prop (not a CSS `data-state`) so panel selection —
   * which never opens the popover — highlights the pin too.
   */
  active?: boolean
} & ComponentPropsWithoutRef<'button'>

/**
 * The teardrop pin: initials sit directly on the solid-blue body (no nested ring), with a white
 * outline + dark count pill. Resolved → grey + check. Active → white body, blue initials/outline.
 */
export const Pin = forwardRef<HTMLButtonElement, PinProps>(function Pin(
  { item, pin, onOpen, onClick, className, style, focused, active, ...rest },
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
      data-airside-pin
      data-airside-pin-id={item.id}
      data-testid="comments-pin"
      data-focused={focused ? 'true' : undefined}
      data-active={active ? 'true' : undefined}
      aria-label={label}
      // compose: Radix's toggle (onClick) AND the optional onOpen both fire
      onClick={(e) => {
        onClick?.(e)
        onOpen?.()
      }}
      // tip of the teardrop points at the anchor (-mt-[34px]); transform is computed → inline
      className={cn(
        'cmnt:absolute cmnt:w-[34px] cmnt:h-[34px] cmnt:-ml-[17px] cmnt:-mt-[34px] cmnt:p-0 cmnt:border-none cmnt:bg-transparent cmnt:cursor-pointer cmnt:pointer-events-auto',
        // lift the active pin above its neighbours (still below the popover/panel surface)
        active && 'cmnt:z-10',
        className,
      )}
      // round to whole pixels so the teardrop tip renders crisp (no sub-pixel blur)
      style={{ transform: `translate(${Math.round(pin.x)}px, ${Math.round(pin.y)}px)`, ...style }}
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
          'cmnt:absolute cmnt:inset-0 cmnt:border-2 cmnt:shadow-lg',
          // resolved keeps a muted grey body; gray-500 (not 400) so the white ✓ stays legible now
          // that the inner white ring is gone. Active (open/selected) → reversed white + blue ring.
          resolved
            ? 'cmnt:bg-gray-500 cmnt:border-white'
            : active
              ? 'cmnt:bg-white cmnt:border-blue-600'
              : 'cmnt:bg-blue-600 cmnt:border-white',
        )}
        style={TEARDROP_STYLE}
      />
      <span
        aria-hidden={true}
        className={cn(
          'cmnt:absolute cmnt:inset-0 cmnt:flex cmnt:items-center cmnt:justify-center cmnt:font-semibold',
          resolved
            ? 'cmnt:text-white cmnt:text-base'
            : active
              ? 'cmnt:text-blue-600 cmnt:text-[13px]'
              : 'cmnt:text-white cmnt:text-[13px]',
        )}
      >
        {resolved ? '✓' : initials(item.createdBy)}
      </span>
      {!resolved && item.commentCount > 0 && (
        <span
          aria-hidden={true}
          className="cmnt:absolute cmnt:-top-1 cmnt:-right-[6px] cmnt:min-w-[20px] cmnt:h-[20px] cmnt:rounded-[10px] cmnt:bg-gray-900 cmnt:text-white cmnt:text-[10px] cmnt:font-bold cmnt:flex cmnt:items-center cmnt:justify-center cmnt:px-[5px] cmnt:border-2 cmnt:border-white cmnt:leading-[0]"
        >
          {item.commentCount}
        </span>
      )}
    </button>
  )
})
