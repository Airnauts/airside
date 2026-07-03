// packages/client/src/marker/storage.ts

import type { SettingEntry } from '../settings/entry'

/**
 * Settings-store entry for the "hide all pins" toggle (`airside:pins-hidden`, issue #32): when
 * `true` the on-page pin/highlight overlay is hidden while comment mode stays open. Owns this
 * setting's full storage wiring — on-disk key, shown-by-default fallback, and parse guard — which
 * the settings store registers in its `ENTRIES` list.
 */
export const pinsHiddenSetting: SettingEntry<boolean> = {
  storageKey: 'airside:pins-hidden',
  fallback: false,
  validate: (parsed) => (typeof parsed === 'boolean' ? parsed : false),
}
