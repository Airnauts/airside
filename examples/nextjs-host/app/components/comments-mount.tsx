'use client'

import { AirsideLayer } from '@airnauts/airside-client/react'

/**
 * Mounts the comments widget. `init()`'s gate keeps it inert until the page is
 * opened once with `?airside-key=dev-key`; after that the key is persisted to
 * localStorage so it stays active without the param. This can render unconditionally.
 */
export function CommentsMount() {
  return (
    <AirsideLayer
      airsideKey="dev-key"
      endpoint="/api/comments"
      features={{ screenshots: true, textAnchors: true }}
      // Default-equivalent pageKey (origin + path), but honoring an optional `?ns=`
      // namespace. The e2e suite shares one in-memory store across tests, so each test
      // passes a unique `ns` to partition its threads; query params other than `ns`
      // (e.g. `?variant=`) are ignored, so capture and reload share a pageKey.
      pageKey={(url) => {
        const u = new URL(url)
        const ns = u.searchParams.get('ns')
        const path = u.pathname.length > 1 ? u.pathname.replace(/\/$/, '') : u.pathname
        const base = `${u.origin}${path}`
        return ns ? `${base}#${ns}` : base
      }}
    />
  )
}
