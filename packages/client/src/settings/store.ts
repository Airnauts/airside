// packages/client/src/settings/store.ts

import { activationKeySetting } from '../activation/storage'
import { identitySetting } from '../identity/storage'
import { launcherPositionSetting } from '../launcher/storage'
import { pinsHiddenSetting } from '../marker/storage'
import type { SettingEntry } from './entry'

/**
 * The single client-side settings store (ADR-0046, ADR-0047). All `localStorage`-backed widget
 * settings live behind this module: it reads every registered key **once** into an in-memory cache
 * (at startup via {@link initSettings}, or lazily on first access) and persists writes through
 * typed accessors.
 *
 * Each setting's wiring — its on-disk key, default, and parse guard — lives in its own domain
 * module's `storage.ts` next to the feature that owns it. This store only imports those configs
 * into {@link ENTRIES} and drives init/read/persist **generically** over the list, so adding a
 * setting means writing its `SettingEntry` in the domain module and adding one line below — never
 * a second per-key edit here. On-disk keys and fallback behaviour match the former per-domain
 * modules exactly.
 */
const ENTRIES = {
  activationKey: activationKeySetting,
  identity: identitySetting,
  launcherPosition: launcherPositionSetting,
  pinsHidden: pinsHiddenSetting,
} satisfies Record<string, SettingEntry<unknown>>

/** A known setting's name — the keys of {@link ENTRIES}, the single registration point. */
export type SettingKey = keyof typeof ENTRIES

/** The settings shape: each key mapped to its value type, derived from its registered entry. */
export type SettingsSchema = { [K in SettingKey]: (typeof ENTRIES)[K]['fallback'] }

/** Read + validate one entry from `storage`, falling back on absent/malformed/wrong-type. Typed
 *  over `unknown` so it can run uniformly across every {@link ENTRIES} value; each entry's own
 *  `validate` guarantees the concrete type the schema records. */
function readEntry(entry: SettingEntry<unknown>, storage: Storage): unknown {
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
 * Read every registered key from `storage` once into the in-memory cache, binding `storage`
 * for subsequent writes. Re-runnable: each call re-hydrates, so the widget calls it once
 * at startup and tests can re-init after seeding `localStorage`.
 */
export function initSettings(storage: Storage = localStorage): void {
  boundStorage = storage
  // Hydrate every entry by looping over ENTRIES, so adding a key needs no second edit and the
  // cache stays in sync with the registered settings automatically.
  cache = Object.fromEntries(
    (Object.keys(ENTRIES) as SettingKey[]).map(
      (key) => [key, readEntry(ENTRIES[key], storage)] as const,
    ),
  ) as SettingsSchema
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
