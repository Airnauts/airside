import { type InitOptions, DEFAULT_KEY_PARAM } from './config'
import { isActivated } from './gate'

export const packageName = '@comments/client'

export * from './anchor'
export type { InitOptions } from './config'
export { DEFAULT_KEY_PARAM } from './config'

export type CommentsHandle = {
  destroy(): void
}

const NOOP_HANDLE: CommentsHandle = { destroy() {} }

/**
 * Mount the widget if a valid key is present in the URL; otherwise a no-op.
 * Async by contract so a future lazy-load split can return a Promise without a
 * breaking change. In M5 the app is statically bundled (no code-splitting); the
 * gate still keeps the widget inert (never mounts, renders, or fetches) when the
 * key is absent.
 */
export async function init(options: InitOptions): Promise<CommentsHandle> {
  if (typeof window === 'undefined') return NOOP_HANDLE
  if (!isActivated({ search: window.location.search, key: options.key, keyParam: options.keyParam ?? DEFAULT_KEY_PARAM })) {
    return NOOP_HANDLE
  }
  const { mount } = await import('./app/mount')
  return mount(options)
}

export const comments = { init }
