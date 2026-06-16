// packages/client/src/ui/ThreadMetadata.tsx
import type { ExternalLink } from '@airnauts/airside-core'

/**
 * Generic, descriptor-driven metadata strip. Renders one external link per {@link ExternalLink}
 * as a new-tab anchor with no provider-specific knowledge. Returns `null` when there are no links.
 */
export function ThreadMetadata({ links }: { links: ExternalLink[] }) {
  if (!links || links.length === 0) return null

  return (
    <div className="air:flex air:flex-wrap air:gap-2">
      {links.map((link) => (
        <a
          key={link.key ?? `${link.provider}:${link.externalId}`}
          href={link.url}
          target="_blank"
          rel="noreferrer"
          className="air:text-sm air:text-blue-600 air:hover:underline"
        >
          {link.label}
        </a>
      ))}
    </div>
  )
}
