// packages/client/src/identity/storage.ts

import type { SettingEntry } from '../settings/entry'

/** The logged-in reviewer's identity. Persisted (and validated) through the settings store via
 *  {@link identitySetting}; the type itself is shared by the store and the UI. */
export type Identity = {
  email: string
  name?: string
}

/**
 * Settings-store entry for the reviewer identity (`airside:identity`). Owns this setting's full
 * storage wiring — on-disk key, absent default, and the parse guard that accepts only an object
 * with a string `email` (and an optional string `name`) — which the settings store registers in
 * its `ENTRIES` list.
 */
export const identitySetting: SettingEntry<Identity | null> = {
  storageKey: 'airside:identity',
  fallback: null,
  validate: (parsed) => {
    if (
      parsed &&
      typeof parsed === 'object' &&
      typeof (parsed as { email?: unknown }).email === 'string'
    ) {
      const { email, name } = parsed as { email: string; name?: unknown }
      return { email, name: typeof name === 'string' ? name : undefined }
    }
    return null
  },
}
