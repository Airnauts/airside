import { loadActivationKey, saveActivationKey } from './activation/storage'
import { DEFAULT_KEY_PARAM, type InitOptions } from './config'
import { isActivated, isUrlActivation } from './gate'

export const packageName = '@comments/client'

export * from './anchor'
export type { InitOptions } from './config'
export { DEFAULT_KEY_PARAM } from './config'

export type CommentsHandle = {
  destroy(): void
}

const NOOP_HANDLE: CommentsHandle = { destroy() {} }

/** Drop the key param from the address bar, preserving every other param and the hash. */
function stripKeyParam(keyParam: string): void {
  const url = new URL(window.location.href)
  url.searchParams.delete(keyParam)
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
export async function init(options: InitOptions): Promise<CommentsHandle> {
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

  const { mount } = await import('./app/mount')
  return mount(options)
}

export const comments = { init }
