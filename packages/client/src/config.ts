import { type CaptureContext, normalizePageKey, type Provenance } from '@airnauts/airside-core'

export type Features = {
  screenshots?: boolean
  textAnchors?: boolean
}

export type InitOptions = {
  key: string
  endpoint: string
  pageKey?: (url: string) => string
  keyParam?: string
  threadParam?: string
  features?: Features
  provenance?: Provenance
  /**
   * Show the "Powered by Airside" footer in the comments panel. Defaults to
   * hidden; set `true` to opt in. Production hosts see no mark unless enabled.
   */
  branding?: boolean
}

export const DEFAULT_KEY_PARAM = 'airside-key'

export { DEFAULT_THREAD_PARAM, threadLink } from '@airnauts/airside-core'

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
