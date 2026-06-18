// packages/client/src/settings/store.ts

import type { Identity } from '../identity/storage'
import { clampTop, DEFAULT_LAUNCHER_POSITION, type LauncherPosition } from '../launcher/storage'

/**
 * The single client-side settings store (ADR-0046). All `localStorage`-backed widget
 * settings live behind this module: it reads every known key **once** into an in-memory
 * cache (at startup via {@link initSettings}, or lazily on first access) and persists
 * writes through typed accessors. The per-key try/catch-guarded parsers are lifted
 * verbatim from the former per-domain `storage.ts` modules, so on-disk keys and
 * fallback behaviour are unchanged.
 */
export type SettingsSchema = {
  /** Activation key persisted after a successful URL-param activation. */
  activationKey: string | null
  /** The logged-in reviewer's identity. */
  identity: Identity | null
  /** Where the launcher pill is stuck. */
  launcherPosition: LauncherPosition
  /** Whether the on-page pin/highlight overlay is hidden (issue #32). */
  pinsHidden: boolean
}

export type SettingKey = keyof SettingsSchema

/** One key's wiring: the on-disk key, its default, and a guard that turns a parsed
 *  (already `JSON.parse`d) value into a valid value or the default. */
type SettingEntry<T> = {
  storageKey: string
  fallback: T
  validate: (parsed: unknown) => T
}

const ENTRIES: { [K in SettingKey]: SettingEntry<SettingsSchema[K]> } = {
  activationKey: {
    storageKey: 'airside:key',
    fallback: null,
    validate: (parsed) => (typeof parsed === 'string' ? parsed : null),
  },
  identity: {
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
  },
  launcherPosition: {
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
  },
  pinsHidden: {
    storageKey: 'airside:pins-hidden',
    fallback: false,
    validate: (parsed) => (typeof parsed === 'boolean' ? parsed : false),
  },
}

/** Read + validate a single key from `storage`, falling back on absent/malformed/wrong-type. */
function readEntry<T>(entry: SettingEntry<T>, storage: Storage): T {
  try {
    const raw = storage.getItem(entry.storageKey)
    if (!raw) return entry.fallback
    return entry.validate(JSON.parse(raw))
  } catch {
    return entry.fallback
  }
}

let cache: SettingsSchema | null = null
// The storage the cache was hydrated from and writes go back to. Resolved lazily (never at
// module-eval time) so importing this module is SSR-safe — `localStorage` is only touched
// inside a browser/jsdom call.
let boundStorage: Storage | undefined

/**
 * Read every known key from `storage` once into the in-memory cache, binding `storage`
 * for subsequent writes. Re-runnable: each call re-hydrates, so the widget calls it once
 * at startup and tests can re-init after seeding `localStorage`.
 */
export function initSettings(storage: Storage = localStorage): void {
  boundStorage = storage
  cache = {
    activationKey: readEntry(ENTRIES.activationKey, storage),
    identity: readEntry(ENTRIES.identity, storage),
    launcherPosition: readEntry(ENTRIES.launcherPosition, storage),
    pinsHidden: readEntry(ENTRIES.pinsHidden, storage),
  }
}

/** The cached value for `key`, lazily hydrating from `localStorage` if {@link initSettings}
 *  has not run (so a directly-mounted `WidgetApp` and SSR-safety both work without init). */
export function getSetting<K extends SettingKey>(key: K): SettingsSchema[K] {
  if (!cache) initSettings()
  return (cache as SettingsSchema)[key]
}

/** Update the cached value and persist it to the bound storage. The write is best-effort:
 *  a quota/availability error must not crash a toggle or a login (issue #32 open question 3). */
export function setSetting<K extends SettingKey>(key: K, value: SettingsSchema[K]): void {
  if (!cache) initSettings()
  ;(cache as SettingsSchema)[key] = value
  const storage = boundStorage ?? localStorage
  try {
    storage.setItem(ENTRIES[key].storageKey, JSON.stringify(value))
  } catch {
    /* storage unavailable — persistence is best-effort */
  }
}

/** Test seam: drop the cache and unbind storage so the next access re-hydrates from a
 *  freshly-seeded `localStorage`. Consumers that seed-then-read between cases must call this. */
export function resetSettings(): void {
  cache = null
  boundStorage = undefined
}
