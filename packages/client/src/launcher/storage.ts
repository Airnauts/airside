// packages/client/src/launcher/storage.ts

/** Which window edge the launcher sticks to. Only the two horizontal edges are allowed. */
export type LauncherEdge = 'left' | 'right'

/** Persisted launcher placement: an edge to stick to plus a vertical offset as a percentage of
 *  the viewport height (the pill is centred on `top`). Horizontal position is never free-form.
 *  The localStorage read/write for this lives in the shared settings store
 *  (`settings/store.ts`, key `airside:launcher-position`); this module keeps the shared types,
 *  the default, and `clampTop`, which the store and the drag hook both import. */
export type LauncherPosition = { edge: LauncherEdge; top: number }

/** Bottom-right-ish, matching the pre-drag default. */
export const DEFAULT_LAUNCHER_POSITION: LauncherPosition = { edge: 'right', top: 92 }

/** Keep the pill on-screen — clamp the vertical centre to a sane band. */
export function clampTop(top: number): number {
  return Math.min(95, Math.max(5, top))
}
