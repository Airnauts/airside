// packages/client/src/ui/Launcher.tsx

import { useDraggablePosition } from '../launcher/useDraggablePosition'
import { cn } from '../lib/cn'
import { Button } from './Button'

export type LauncherProps = {
  placing: boolean
  onTogglePlace: () => void
  openCount: number
  onTogglePanel: () => void
}

/** Compact, icon-only launcher pill. Drag anywhere on it to stick it to either window edge;
 *  the position persists. (The show-resolved toggle now lives in the panel sidebar.) */
export function Launcher({ placing, onTogglePlace, openCount, onTogglePanel }: LauncherProps) {
  const { style, dragging, onPointerDown, onClickCapture } = useDraggablePosition()
  return (
    <div
      style={style}
      onPointerDown={onPointerDown}
      onClickCapture={onClickCapture}
      className={cn(
        'cmnt:fixed cmnt:flex cmnt:items-center cmnt:gap-1 cmnt:bg-white cmnt:border cmnt:border-gray-200 cmnt:rounded-full cmnt:p-1 cmnt:pointer-events-auto cmnt:select-none cmnt:touch-none cmnt:shadow-[0_6px_20px_rgba(0,0,0,0.18)]',
        dragging ? 'cmnt:cursor-grabbing' : 'cmnt:cursor-grab',
      )}
    >
      <Button
        variant="ghost"
        size="icon"
        aria-label="Open comments panel"
        data-testid="comments-panel-open"
        onClick={onTogglePanel}
        className="cmnt:hover:bg-gray-100"
      >
        <span aria-hidden={true}>☰</span>
      </Button>
      <Button
        variant="primary"
        size="icon"
        data-comments-place
        data-testid="comments-place"
        aria-pressed={placing}
        aria-label={placing ? 'Click on the page to comment' : 'Add comment'}
        onClick={onTogglePlace}
        className={cn('cmnt:relative', placing && 'cmnt:bg-blue-800')}
      >
        <span aria-hidden={true}>{placing ? '✎' : '＋'}</span>
        {!placing && openCount > 0 && (
          <span
            aria-hidden={true}
            className="cmnt:absolute cmnt:-top-1 cmnt:-right-1 cmnt:min-w-4 cmnt:h-4 cmnt:px-1 cmnt:rounded-full cmnt:bg-blue-800 cmnt:text-white cmnt:text-[10px] cmnt:leading-4 cmnt:text-center cmnt:pointer-events-none"
          >
            {openCount}
          </span>
        )}
      </Button>
    </div>
  )
}
