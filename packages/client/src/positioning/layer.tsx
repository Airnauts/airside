// packages/client/src/positioning/layer.tsx
import type { ApiClient } from '../api/client'
import type { Identity } from '../identity/storage'
import type { PlacedThread } from '../threads/state'
import { useFocus } from '../threads/useThreads'
import { ThreadPopover } from '../ui/ThreadPopover'

export type { PlacedThread } from '../threads/state'

export type PinLayerProps = {
  placements: PlacedThread[]
  client: Pick<ApiClient, 'getThread' | 'addComment' | 'setThreadStatus' | 'upload'>
  identity: Identity | null
  onNeedIdentity: (resume: (who: Identity) => void) => void
}

export function PinLayer({ placements, client, identity, onNeedIdentity }: PinLayerProps) {
  const { focusedId } = useFocus()
  return (
    <div data-comments-overlay className="cmnt:absolute cmnt:inset-0 cmnt:pointer-events-none">
      {placements.flatMap((p) =>
        p.highlight.map((h) => (
          <div
            key={`${p.item.id}-hl-${h.x}-${h.y}-${h.width}-${h.height}`}
            data-testid="comments-highlight"
            data-comments-highlight
            className="cmnt:absolute cmnt:bg-blue-600/20 cmnt:pointer-events-none"
            // transform + dims are computed → inline
            style={{ transform: `translate(${h.x}px, ${h.y}px)`, width: h.width, height: h.height }}
          />
        )),
      )}
      {placements.map((p) => (
        <ThreadPopover
          key={p.item.id}
          item={p.item}
          pin={p.pin}
          focused={p.item.id === focusedId}
          client={client}
          identity={identity}
          onNeedIdentity={onNeedIdentity}
        />
      ))}
    </div>
  )
}
