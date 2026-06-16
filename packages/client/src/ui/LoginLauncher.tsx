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
        'air:fixed air:z-[var(--air-z-launcher)] air:flex air:items-center air:pointer-events-auto air:select-none air:touch-none',
        dragging ? 'air:cursor-grabbing' : 'air:cursor-grab',
      )}
    >
      <Button
        variant="primary"
        size="md"
        aria-label="Log in"
        data-testid="airside-login"
        onClick={onLogIn}
        className="air:gap-1.5 air:shadow-[0_6px_20px_rgba(0,0,0,0.18)]"
      >
        <span aria-hidden={true}>🔑</span> Log In
      </Button>
    </div>
  )
}
