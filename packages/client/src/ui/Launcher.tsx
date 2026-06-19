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
}

/** Compact, icon-only launcher pill. Drag anywhere on it to stick it to either window edge;
 *  the position persists. (The show-resolved toggle now lives in the panel sidebar.) */
export function Launcher({
  placing,
  onTogglePlace,
  openCount,
  panelOpen,
  onTogglePanel,
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
    </div>
  )
}
