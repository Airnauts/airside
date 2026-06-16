// packages/client/src/positioning/layer.tsx
import type { ApiClient } from '../api/client'
import { usePanelState } from '../panel/PanelProvider'
import type { PlacedThread } from '../threads/state'
import { useFocus } from '../threads/useThreads'
import { ThreadPopover } from '../ui/ThreadPopover'

export type { PlacedThread } from '../threads/state'

export type PinLayerProps = {
  placements: PlacedThread[]
  client: Pick<ApiClient, 'getThread' | 'addComment' | 'setThreadStatus' | 'upload'>
}

export function PinLayer({ placements, client }: PinLayerProps) {
  const { focusedId } = useFocus()
  // The thread open in the sidebar panel detail view: its on-page pin is highlighted as active
  // even though selecting it in the panel never opens the pin's popover.
  const { detailThreadId } = usePanelState()
  return (
    <div data-airside-overlay className="air:absolute air:inset-0 air:pointer-events-none">
      {placements.flatMap((p) =>
        p.highlight.map((h) => (
          <div
            key={`${p.item.id}-hl-${h.x}-${h.y}-${h.width}-${h.height}`}
            data-testid="airside-highlight"
            data-airside-highlight
            className="air:absolute air:bg-blue-600/20 air:pointer-events-none"
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
          selected={p.item.id === detailThreadId}
          client={client}
        />
      ))}
    </div>
  )
}
