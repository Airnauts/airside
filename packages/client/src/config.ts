import { type CaptureContext, normalizePageKey, type Provenance } from '@airnauts/comments-core'

export type Features = {
  screenshots?: boolean
  textAnchors?: boolean
}

export type InitOptions = {
  key: string
  endpoint: string
  pageKey?: (url: string) => string
  keyParam?: string
  features?: Features
  provenance?: Provenance
}

export const DEFAULT_KEY_PARAM = 'comments-key'

export const DEFAULT_THREAD_PARAM = 'comments-thread'

/** Build a deep-link URL that focuses a thread on its page. */
export function threadLink(
  pageUrl: string,
  threadId: string,
  param = DEFAULT_THREAD_PARAM,
): string {
  const url = new URL(pageUrl)
  url.searchParams.set(param, threadId)
  return url.toString()
}

export function resolvePageKey(opts: InitOptions, url: string): string {
  return opts.pageKey ? opts.pageKey(url) : normalizePageKey(url)
}

export function buildCaptureContext(win: Window = window): CaptureContext {
  return {
    viewportW: Math.max(1, Math.round(win.innerWidth)),
    viewportH: Math.max(1, Math.round(win.innerHeight)),
    devicePixelRatio: win.devicePixelRatio || 1,
    userAgent: win.navigator.userAgent,
  }
}
