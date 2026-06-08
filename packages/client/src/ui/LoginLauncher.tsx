// packages/client/src/ui/LoginLauncher.tsx
import { useDraggablePosition } from '../launcher/useDraggablePosition'
import { cn } from '../lib/cn'
import { Button } from './Button'

export type LoginLauncherProps = {
  /** Open the login (identity) modal. */
  onLogIn: () => void
}

/** Logged-out entry point: a fixed pill with a single "Log In" button. Rendered at app
 *  level because the full Launcher lives inside MarkerLayer, which is unmounted until login.
 *  Draggable to either edge, sharing the launcher's persisted position. */
export function LoginLauncher({ onLogIn }: LoginLauncherProps) {
  const { style, dragging, onPointerDown, onClickCapture } = useDraggablePosition()
  return (
    <div
      style={style}
      onPointerDown={onPointerDown}
      onClickCapture={onClickCapture}
      className={cn(
        'cmnt:fixed cmnt:z-[var(--cmnt-z-launcher)] cmnt:flex cmnt:items-center cmnt:pointer-events-auto cmnt:select-none cmnt:touch-none',
        dragging ? 'cmnt:cursor-grabbing' : 'cmnt:cursor-grab',
      )}
    >
      <Button
        variant="primary"
        size="md"
        aria-label="Log in"
        data-testid="comments-login"
        onClick={onLogIn}
        className="cmnt:gap-1.5 cmnt:shadow-[0_6px_20px_rgba(0,0,0,0.18)]"
      >
        <span aria-hidden={true}>🔑</span> Log In
      </Button>
    </div>
  )
}
