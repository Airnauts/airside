// packages/client/src/panel/navigate.ts
export const FOCUS_STORAGE_KEY = 'airside:focus'

export type FocusHandoff = { id: string; openDetail: boolean }

/** Read the cross-page focus target and clear it so it fires exactly once on the destination page. */
export function takeFocusHandoff(storage: Storage = sessionStorage): FocusHandoff | null {
  try {
    const raw = storage.getItem(FOCUS_STORAGE_KEY)
    if (!raw) return null
    storage.removeItem(FOCUS_STORAGE_KEY)
    if (raw.startsWith('{')) {
      const parsed = JSON.parse(raw) as Partial<FocusHandoff>
      if (typeof parsed.id === 'string') {
        return { id: parsed.id, openDetail: parsed.openDetail === true }
      }
      return null
    }
    return { id: raw, openDetail: false } // legacy bare-string id
  } catch {
    return null
  }
}

export type NavigateDeps = { storage?: Storage; assign?: (url: string) => void }

/** Stash the focus target, then navigate to the thread's page (full reload or SPA route). */
export function goToThread(
  row: { id: string; pageUrl: string; openDetail?: boolean },
  deps: NavigateDeps = {},
): void {
  const storage = deps.storage ?? sessionStorage
  try {
    storage.setItem(
      FOCUS_STORAGE_KEY,
      JSON.stringify({ id: row.id, openDetail: row.openDetail === true }),
    )
  } catch {
    /* storage unavailable — navigation still proceeds, just without auto-focus */
  }
  const assign =
    deps.assign ??
    ((url: string) => {
      window.location.href = url
    })
  assign(row.pageUrl)
}
