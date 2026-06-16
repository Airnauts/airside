import { loadActivationKey, saveActivationKey } from './activation/storage'
import { DEFAULT_KEY_PARAM, DEFAULT_THREAD_PARAM, type InitOptions } from './config'
import { isActivated, isUrlActivation } from './gate'
import { FOCUS_STORAGE_KEY } from './panel/navigate'

export const packageName = '@airnauts/comments-client'

export * from './anchor'
export type { InitOptions } from './config'
export { DEFAULT_KEY_PARAM, DEFAULT_THREAD_PARAM } from './config'

export type AirsideHandle = {
  destroy(): void
}

const NOOP_HANDLE: AirsideHandle = { destroy() {} }

/** Drop the key param from the address bar, preserving every other param and the hash. */
function stripKeyParam(keyParam: string): void {
  const url = new URL(window.location.href)
  url.searchParams.delete(keyParam)
  window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash)
}

/**
 * Translate a `?airside-thread=<id>` deep-link into the cross-page focus handoff
 * (so the boot consumer opens that thread's sidebar detail), then strip the param
 * from the address bar — mirroring the key-param handling.
 */
export function consumeThreadParam(param: string): void {
  const url = new URL(window.location.href)
  const id = url.searchParams.get(param)
  if (!id) return
  try {
    sessionStorage.setItem(FOCUS_STORAGE_KEY, JSON.stringify({ id, openDetail: true }))
  } catch {
    /* storage unavailable — deep-link focus is best-effort */
  }
  url.searchParams.delete(param)
  window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash)
}

/**
 * Mount the widget if a valid key is present in the URL — or was persisted from a
 * prior URL activation; otherwise a no-op. When activated via the URL param, the
 * key is persisted to localStorage and stripped from the URL, so subsequent
 * visits keep commenting available without the param.
 *
 * Async by contract so a future lazy-load split can return a Promise without a
 * breaking change. In M5 the app is statically bundled (no code-splitting); the
 * gate still keeps the widget inert (never mounts, renders, or fetches) when the
 * key is absent.
 */
export async function init(options: InitOptions): Promise<AirsideHandle> {
  if (typeof window === 'undefined') return NOOP_HANDLE
  const keyParam = options.keyParam ?? DEFAULT_KEY_PARAM
  const search = window.location.search

  if (!isActivated({ search, key: options.key, keyParam, storedKey: loadActivationKey() })) {
    return NOOP_HANDLE
  }

  if (isUrlActivation({ search, key: options.key, keyParam })) {
    saveActivationKey(options.key)
    stripKeyParam(keyParam)
  }

  consumeThreadParam(options.threadParam ?? DEFAULT_THREAD_PARAM)

  const { mount } = await import('./app/mount')
  return mount(options)
}

export const airside = { init }
