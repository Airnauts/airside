// packages/client/src/positioning/layer.tsx
import type { PlacedThread } from '../threads/state'

export type { PlacedThread } from '../threads/state'

export function PinLayer({ placements }: { placements: PlacedThread[] }) {
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
        <div
          key={p.item.id}
          data-testid="comments-pin"
          data-comments-pin
          className="cmnt:absolute cmnt:w-5 cmnt:h-5 cmnt:-ml-2.5 cmnt:-mt-2.5 cmnt:rounded-full cmnt:bg-blue-600 cmnt:pointer-events-auto"
          style={{ transform: `translate(${p.pin.x}px, ${p.pin.y}px)` }}
        />
      ))}
    </div>
  )
}
