// packages/client/src/settings/entry.ts

/**
 * One persisted client setting's wiring, owned by its domain module (ADR-0047): the on-disk
 * `localStorage` key, the default to fall back on, and a guard that turns an already-`JSON.parse`d
 * value into a valid value or that default. The settings store (`settings/store.ts`) imports each
 * domain's entry and registers it in `ENTRIES`, then drives init/read/persist generically over the
 * list — keeping all of a setting's logic in one place next to the feature that owns it.
 *
 * @typeParam T - the setting's value type (what `getSetting`/`setSetting` see for this key).
 */
export type SettingEntry<T> = {
  /** The `localStorage` key this setting is stored under. */
  storageKey: string
  /** The value used when the key is absent, malformed, or the wrong type. */
  fallback: T
  /** Turn an already-`JSON.parse`d value into a valid `T`, or return the fallback. */
  validate: (parsed: unknown) => T
}
