// packages/client/src/ui/icons/index.tsx
//
// The widget's single icon definition point. Tiny, zero-dependency inline-SVG components
// so the widget owns its iconography end-to-end (no runtime icon-library dep on
// `@airnauts/airside-client`). Each icon draws with `currentColor` and is sized by an
// explicit **px** `size` (rem-independent, matching the widget's px-pinned `@theme` tokens),
// so it inherits colour + hover/active state from its interactive parent.
//
// Icons are **decorative by default** (`aria-hidden` + `focusable="false"`): the accessible
// name lives on the parent Button/anchor (`aria-label`) or its visible text. Pass `title` only
// for a standalone, meaningful icon — it then exposes a `<title>` and `role="img"`.
//
// Icons stay internal to `ui/` — they are not part of the package's public export surface.

import type { ReactNode } from 'react'
import { cn } from '../../lib/cn'

export type IconProps = {
  /** px applied to both width and height (rem-independent). Defaults to 16. */
  size?: number
  className?: string
  /**
   * Set only for a standalone, meaningful icon: renders a `<title>` and exposes the icon to
   * assistive tech (`role="img"`). Omit for decorative icons (the default) — the accessible
   * name then belongs to the interactive parent.
   */
  title?: string
}

/** A named icon component. */
export type IconComponent = (props: IconProps) => ReactNode

function Icon({
  size = 16,
  className,
  title,
  children,
}: IconProps & { children: ReactNode }): ReactNode {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none' as const,
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    focusable: false,
    className: cn('air:inline-block air:shrink-0', className),
  }
  // Meaningful icon: exposed to assistive tech with its label.
  if (title != null) {
    return (
      <svg {...common} role="img" aria-label={title}>
        <title>{title}</title>
        {children}
      </svg>
    )
  }
  // Decorative default: hidden from assistive tech (the label lives on the parent).
  return (
    <svg {...common} aria-hidden={true}>
      {children}
    </svg>
  )
}

export const CheckIcon: IconComponent = (props) => (
  <Icon {...props}>
    <path d="M20 6 9 17l-5-5" />
  </Icon>
)

export const CloseIcon: IconComponent = (props) => (
  <Icon {...props}>
    <path d="M18 6 6 18" />
    <path d="m6 6 12 12" />
  </Icon>
)

export const MoreIcon: IconComponent = (props) => (
  <Icon {...props}>
    <circle cx="5" cy="12" r="1" />
    <circle cx="12" cy="12" r="1" />
    <circle cx="19" cy="12" r="1" />
  </Icon>
)

export const AttachIcon: IconComponent = (props) => (
  <Icon {...props}>
    <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
  </Icon>
)

/** Lifted verbatim from the former hand-rolled `CommentList` svg — the style baseline. */
export const ExternalLinkIcon: IconComponent = (props) => (
  <Icon {...props}>
    <path d="M15 3h6v6" />
    <path d="M10 14 21 3" />
    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
  </Icon>
)

/** Counter-clockwise rotate (the former `↺` reopen glyph). */
export const ReopenIcon: IconComponent = (props) => (
  <Icon {...props}>
    <polyline points="1 4 1 10 7 10" />
    <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
  </Icon>
)

/** Four-point sparkle (the former `✦` what's-new glyph). Filled so it reads at 16px. */
export const SparkleIcon: IconComponent = (props) => (
  <Icon {...props}>
    <path
      d="M12 3c.9 4.5 2.7 6.75 8 9-5.3 2.25-7.1 4.5-8 9-.9-4.5-2.7-6.75-8-9 5.3-2.25 7.1-4.5 8-9Z"
      fill="currentColor"
      stroke="none"
    />
  </Icon>
)

/**
 * A spinning progress indicator. Rendered as the widget's established border-spinner (same
 * markup as the attachment upload spinner) rather than an SVG, so it inherits `currentColor`
 * and reuses the already-generated `air:animate-spin` utilities.
 */
export function SpinnerIcon({ size = 16, className }: Omit<IconProps, 'title'>): ReactNode {
  return (
    <span
      aria-hidden={true}
      className={cn(
        'air:inline-block air:shrink-0 air:rounded-full air:border-2 air:border-current air:border-t-transparent air:animate-spin',
        className,
      )}
      style={{ width: size, height: size }}
    />
  )
}

/**
 * Widget-only registry mapping a descriptor's `presentation.icon` **name** to a known icon.
 * A closed set: an unknown or absent name resolves to nothing (never a raw glyph), so an
 * extension can only ever render an icon that belongs to this set.
 */
const iconByName: Record<string, IconComponent> = {
  check: CheckIcon,
  close: CloseIcon,
  more: MoreIcon,
  attach: AttachIcon,
  'external-link': ExternalLinkIcon,
  reopen: ReopenIcon,
}

/** Resolve a descriptor `presentation.icon` name to its icon component, or `null` if unknown. */
export function resolveIcon(name?: string): IconComponent | null {
  if (!name) return null
  return iconByName[name] ?? null
}
