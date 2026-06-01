// packages/client/src/panel/navigate.ts
export const FOCUS_STORAGE_KEY = 'cmnt:focus'

/** Read the cross-page focus target and clear it so it fires exactly once on the destination page. */
export function takeFocusHandoff(storage: Storage = sessionStorage): string | null {
  try {
    const id = storage.getItem(FOCUS_STORAGE_KEY)
    if (id) storage.removeItem(FOCUS_STORAGE_KEY)
    return id
  } catch {
    return null
  }
}

export type NavigateDeps = { storage?: Storage; assign?: (url: string) => void }

/** Stash the focus target, then navigate to the thread's page (full reload or SPA route). */
export function goToThread(row: { id: string; pageUrl: string }, deps: NavigateDeps = {}): void {
  const storage = deps.storage ?? sessionStorage
  try {
    storage.setItem(FOCUS_STORAGE_KEY, row.id)
  } catch {
    /* storage unavailable — navigation still proceeds, just without auto-focus */
  }
  const assign = deps.assign ?? ((url: string) => void (window.location.href = url))
  assign(row.pageUrl)
}
