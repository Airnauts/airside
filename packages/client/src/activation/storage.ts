// packages/client/src/activation/storage.ts

import type { SettingEntry } from '../settings/entry'

/**
 * Settings-store entry for the activation key (`airside:key`), persisted after a successful
 * URL-param activation so later visits stay activated without the param. Owns this setting's
 * full storage wiring — on-disk key, absent default, and parse guard — which the settings store
 * registers in its `ENTRIES` list.
 */
export const activationKeySetting: SettingEntry<string | null> = {
  storageKey: 'airside:key',
  fallback: null,
  validate: (parsed) => (typeof parsed === 'string' ? parsed : null),
}
