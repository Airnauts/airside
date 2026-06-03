// packages/client/src/ui/LoginLauncher.tsx

export type LoginLauncherProps = {
  /** Open the login (identity) modal. */
  onLogIn: () => void
}

/** Logged-out entry point: a fixed pill with a single "Log In" button. Rendered at app
 *  level because the full Launcher lives inside MarkerLayer, which is unmounted until login. */
export function LoginLauncher({ onLogIn }: LoginLauncherProps) {
  return (
    <div className="cmnt:fixed cmnt:bottom-4 cmnt:right-4 cmnt:flex cmnt:items-center cmnt:pointer-events-auto">
      <button
        type="button"
        aria-label="Log in"
        data-testid="comments-login"
        onClick={onLogIn}
        className="cmnt:inline-flex cmnt:items-center cmnt:gap-1.5 cmnt:rounded-full cmnt:px-4 cmnt:py-2 cmnt:bg-blue-600 cmnt:text-white cmnt:border-none cmnt:cursor-pointer cmnt:text-[13px] cmnt:font-semibold cmnt:shadow-[0_6px_20px_rgba(0,0,0,0.18)]"
      >
        <span aria-hidden={true}>🔑</span> Log In
      </button>
    </div>
  )
}
