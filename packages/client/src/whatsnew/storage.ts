// packages/client/src/whatsnew/storage.ts

import type { SettingEntry } from '../settings/entry'

/**
 * Settings-store entry for the last "what's new" version the reviewer has seen
 * (`airside:whats-new-seen`), persisted so the release-highlights modal auto-shows only once
 * per new version. Owns this setting's full storage wiring — on-disk key, absent default, and
 * parse guard — which the settings store registers in its `ENTRIES` list.
 */
export const whatsNewSeenSetting: SettingEntry<string | null> = {
  storageKey: 'airside:whats-new-seen',
  fallback: null,
  validate: (parsed) => (typeof parsed === 'string' ? parsed : null),
}
