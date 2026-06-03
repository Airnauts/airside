// packages/client/src/ui/Launcher.tsx
import { Button } from './Button'
import { cn } from '../lib/cn'

export type LauncherProps = {
  placing: boolean
  onTogglePlace: () => void
  showResolved: boolean
  onShowResolved: (value: boolean) => void
  openCount: number
  onTogglePanel: () => void
}

export function Launcher({
  placing,
  onTogglePlace,
  showResolved,
  onShowResolved,
  openCount,
  onTogglePanel,
}: LauncherProps) {
  return (
    <div className="cmnt:fixed cmnt:bottom-4 cmnt:right-4 cmnt:flex cmnt:items-center cmnt:gap-2 cmnt:bg-white cmnt:border cmnt:border-gray-200 cmnt:rounded-full cmnt:py-1.5 cmnt:pl-3 cmnt:pr-2 cmnt:pointer-events-auto cmnt:shadow-[0_6px_20px_rgba(0,0,0,0.18)]">
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
      <button
        type="button"
        role="switch"
        aria-checked={showResolved}
        aria-label="Show resolved threads"
        onClick={() => onShowResolved(!showResolved)}
        className="cmnt:inline-flex cmnt:items-center cmnt:gap-1.5 cmnt:bg-transparent cmnt:border-none cmnt:cursor-pointer cmnt:text-xs cmnt:text-gray-500"
      >
        <span
          aria-hidden={true}
          className={cn(
            'cmnt:w-7 cmnt:h-4 cmnt:rounded-full cmnt:relative cmnt:transition-colors',
            showResolved ? 'cmnt:bg-blue-600' : 'cmnt:bg-gray-300',
          )}
        >
          <span
            className={cn(
              'cmnt:absolute cmnt:top-0.5 cmnt:w-3 cmnt:h-3 cmnt:rounded-full cmnt:bg-white cmnt:transition-all',
              showResolved ? 'cmnt:left-[14px]' : 'cmnt:left-0.5',
            )}
          />
        </span>
        Resolved
      </button>
      <Button
        variant="primary"
        size="md"
        data-comments-place
        data-testid="comments-place"
        aria-pressed={placing}
        onClick={onTogglePlace}
        className={cn(placing && 'cmnt:bg-blue-800')}
      >
        {placing ? 'Click to comment…' : `+ Comment${openCount ? ` (${openCount})` : ''}`}
      </Button>
    </div>
  )
}
