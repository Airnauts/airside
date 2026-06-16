// packages/client/src/launcher/storage.ts

/** Which window edge the launcher sticks to. Only the two horizontal edges are allowed. */
export type LauncherEdge = 'left' | 'right'

/** Persisted launcher placement: an edge to stick to plus a vertical offset as a percentage of
 *  the viewport height (the pill is centred on `top`). Horizontal position is never free-form. */
export type LauncherPosition = { edge: LauncherEdge; top: number }

const STORAGE_KEY = 'airside:launcher-position'

/** Bottom-right-ish, matching the pre-drag default. */
export const DEFAULT_LAUNCHER_POSITION: LauncherPosition = { edge: 'right', top: 92 }

/** Keep the pill on-screen — clamp the vertical centre to a sane band. */
export function clampTop(top: number): number {
  return Math.min(95, Math.max(5, top))
}

export function loadLauncherPosition(store: Storage = localStorage): LauncherPosition {
  try {
    const raw = store.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_LAUNCHER_POSITION
    const parsed: unknown = JSON.parse(raw)
    if (parsed && typeof parsed === 'object') {
      const { edge, top } = parsed as { edge?: unknown; top?: unknown }
      if (
        (edge === 'left' || edge === 'right') &&
        typeof top === 'number' &&
        Number.isFinite(top)
      ) {
        return { edge, top: clampTop(top) }
      }
    }
    return DEFAULT_LAUNCHER_POSITION
  } catch {
    return DEFAULT_LAUNCHER_POSITION
  }
}

export function saveLauncherPosition(pos: LauncherPosition, store: Storage = localStorage): void {
  store.setItem(STORAGE_KEY, JSON.stringify(pos))
}
