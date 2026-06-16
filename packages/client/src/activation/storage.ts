const STORAGE_KEY = 'airside:key'

/** The activation key persisted after a successful URL-param activation, or null. */
export function loadActivationKey(store: Storage = localStorage): string | null {
  try {
    const raw = store.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    return typeof parsed === 'string' ? parsed : null
  } catch {
    return null
  }
}

export function saveActivationKey(key: string, store: Storage = localStorage): void {
  store.setItem(STORAGE_KEY, JSON.stringify(key))
}
