import type { Box, XY } from './coords'

export type Placement = { id: string; pin: XY; highlight: Box[]; pending: boolean }

export function PinLayer({ placements }: { placements: Placement[] }) {
  return (
    <div data-comments-overlay style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      {placements.flatMap((p) =>
        p.highlight.map((h) => (
          <div
            key={`${p.id}-hl-${h.x}-${h.y}-${h.width}-${h.height}`}
            data-testid="comments-highlight"
            data-comments-highlight
            style={{
              position: 'absolute',
              transform: `translate(${h.x}px, ${h.y}px)`,
              width: h.width,
              height: h.height,
              background: 'rgba(37,99,235,0.18)',
              pointerEvents: 'none',
            }}
          />
        )),
      )}
      {placements.map((p) => (
        <div
          key={p.id}
          data-testid="comments-pin"
          data-comments-pin
          style={{
            position: 'absolute',
            transform: `translate(${p.pin.x}px, ${p.pin.y}px)`,
            width: 20,
            height: 20,
            marginLeft: -10,
            marginTop: -10,
            borderRadius: '9999px',
            background: p.pending ? '#9ca3af' : '#2563eb',
            pointerEvents: 'auto',
          }}
        />
      ))}
    </div>
  )
}
