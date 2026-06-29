// packages/client/src/ui/Launcher.tsx

import { useDraggablePosition } from '../launcher/useDraggablePosition'
import { cn } from '../lib/cn'
import { Button } from './Button'

export type LauncherProps = {
  placing: boolean
  onTogglePlace: () => void
  openCount: number
  panelOpen: boolean
  onTogglePanel: () => void
  /** Whether the on-page pin/highlight overlay is currently hidden. */
  pinsHidden: boolean
  /** Show/hide every pin and highlight without leaving comment mode (issue #32). */
  onTogglePins: () => void
}

/** Compact, icon-only launcher pill. Drag anywhere on it to stick it to either window edge;
 *  the position persists. (The show-resolved toggle now lives in the panel sidebar.) */
export function Launcher({
  placing,
  onTogglePlace,
  openCount,
  panelOpen,
  onTogglePanel,
  pinsHidden,
  onTogglePins,
}: LauncherProps) {
  const { style, dragging, onPointerDown, onClickCapture } = useDraggablePosition()
  return (
    <div
      data-airside-chrome
      style={style}
      onPointerDown={onPointerDown}
      onClickCapture={onClickCapture}
      className={cn(
        'air:fixed air:z-[var(--air-z-launcher)] air:flex air:items-center air:gap-1 air:bg-white air:border air:border-gray-200 air:rounded-full air:p-1 air:pointer-events-auto air:select-none air:touch-none air:shadow-[0_6px_20px_rgba(0,0,0,0.18)]',
        dragging ? 'air:cursor-grabbing' : 'air:cursor-grab',
      )}
    >
      <Button
        variant="ghost"
        size="icon"
        aria-label={panelOpen ? 'Close comments panel' : 'Open comments panel'}
        aria-expanded={panelOpen}
        data-testid="airside-panel-open"
        onClick={onTogglePanel}
        className="air:hover:bg-gray-100"
      >
        <span aria-hidden={true}>☰</span>
      </Button>
      <Button
        variant="primary"
        size="icon"
        data-airside-place
        data-testid="airside-place"
        aria-pressed={placing}
        aria-label={placing ? 'Click on the page to comment' : 'Add comment'}
        disabled={pinsHidden}
        onClick={onTogglePlace}
        className={cn('air:relative', placing && 'air:bg-blue-800')}
      >
        <span aria-hidden={true}>{placing ? '✎' : '＋'}</span>
        {!placing && openCount > 0 && (
          <span
            aria-hidden={true}
            className="air:absolute air:-top-1 air:-right-1 air:min-w-4 air:h-4 air:px-1 air:rounded-full air:bg-blue-800 air:text-white air:text-[10px] air:leading-4 air:text-center air:pointer-events-none"
          >
            {openCount}
          </span>
        )}
      </Button>
      <Button
        variant="ghost"
        size="icon"
        data-testid="airside-toggle-pins"
        aria-pressed={pinsHidden}
        aria-label={pinsHidden ? 'Show pins' : 'Hide pins'}
        onClick={onTogglePins}
        className="air:hover:bg-gray-100"
      >
        <span aria-hidden={true}>
          <svg
            viewBox="0 0 24 24"
            width="16"
            height="16"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <title>Pin visibility</title>
            {pinsHidden ? (
              <>
                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                <line x1="1" y1="1" x2="23" y2="23" />
              </>
            ) : (
              <>
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                <circle cx="12" cy="12" r="3" />
              </>
            )}
          </svg>
        </span>
      </Button>
    </div>
  )
}
