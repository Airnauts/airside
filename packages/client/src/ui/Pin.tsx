// packages/client/src/ui/Pin.tsx
import type { ThreadListItem } from '@airnauts/airside-core'
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
      data-testid="airside-pin"
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
        'air:absolute air:w-[34px] air:h-[34px] air:-ml-[17px] air:-mt-[34px] air:p-0 air:border-none air:bg-transparent air:cursor-pointer air:pointer-events-auto',
        // lift the active pin above its neighbours (still below the popover/panel surface)
        active && 'air:z-10',
        className,
      )}
      // round to whole pixels so the teardrop tip renders crisp (no sub-pixel blur)
      style={{ transform: `translate(${Math.round(pin.x)}px, ${Math.round(pin.y)}px)`, ...style }}
    >
      {focused && (
        <span
          aria-hidden={true}
          data-testid="airside-pin-pulse"
          className="air:absolute air:inset-0 air:rounded-full air:bg-blue-500/40 air:animate-ping"
        />
      )}
      <span
        aria-hidden={true}
        className={cn(
          'air:absolute air:inset-0 air:border-2 air:shadow-lg',
          // resolved keeps a muted grey body; gray-500 (not 400) so the white ✓ stays legible now
          // that the inner white ring is gone. Active (open/selected) → reversed white + blue ring.
          resolved
            ? 'air:bg-gray-500 air:border-white'
            : active
              ? 'air:bg-white air:border-blue-600'
              : 'air:bg-blue-600 air:border-white',
        )}
        style={TEARDROP_STYLE}
      />
      <span
        aria-hidden={true}
        className={cn(
          'air:absolute air:inset-0 air:flex air:items-center air:justify-center air:font-semibold',
          resolved
            ? 'air:text-white air:text-base'
            : active
              ? 'air:text-blue-600 air:text-[13px]'
              : 'air:text-white air:text-[13px]',
        )}
      >
        {resolved ? '✓' : initials(item.createdBy)}
      </span>
      {!resolved && item.commentCount > 0 && (
        <span
          aria-hidden={true}
          className="air:absolute air:-top-1 air:-right-[6px] air:min-w-[20px] air:h-[20px] air:rounded-[10px] air:bg-gray-900 air:text-white air:text-[10px] air:font-bold air:flex air:items-center air:justify-center air:px-[5px] air:border-2 air:border-white air:leading-[0]"
        >
          {item.commentCount}
        </span>
      )}
    </button>
  )
})
