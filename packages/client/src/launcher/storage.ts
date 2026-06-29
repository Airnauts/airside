// packages/client/src/launcher/storage.ts

import type { SettingEntry } from '../settings/entry'

/** Which window edge the launcher sticks to. Only the two horizontal edges are allowed. */
export type LauncherEdge = 'left' | 'right'

/** Persisted launcher placement: an edge to stick to plus a vertical offset as a percentage of
 *  the viewport height (the pill is centred on `top`). Horizontal position is never free-form.
 *  Persisted (and validated) through the settings store via {@link launcherPositionSetting}; this
 *  module keeps the shared types, the default, and `clampTop`, which the store entry and the drag
 *  hook both use. */
export type LauncherPosition = { edge: LauncherEdge; top: number }

/** Bottom-right-ish, matching the pre-drag default. */
export const DEFAULT_LAUNCHER_POSITION: LauncherPosition = { edge: 'right', top: 92 }

/** Keep the pill on-screen — clamp the vertical centre to a sane band. */
export function clampTop(top: number): number {
  return Math.min(95, Math.max(5, top))
}

/**
 * Settings-store entry for the launcher placement (`airside:launcher-position`). Owns this
 * setting's full storage wiring — on-disk key, default, and the parse guard (which clamps a stored
 * `top` back on-screen on the way in) — which the settings store registers in its `ENTRIES` list.
 */
export const launcherPositionSetting: SettingEntry<LauncherPosition> = {
  storageKey: 'airside:launcher-position',
  fallback: DEFAULT_LAUNCHER_POSITION,
  validate: (parsed) => {
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
  },
}
