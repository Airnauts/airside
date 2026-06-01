'use client'

import { CommentsLayer } from '@comments/client/react'

/**
 * Mounts the comments widget. `init()`'s gate keeps it inert until the page is
 * opened once with `?comments-key=dev-key`; after that the key is persisted to
 * localStorage so it stays active without the param. This can render unconditionally.
 */
export function CommentsMount() {
  return (
    <CommentsLayer
      commentsKey="dev-key"
      endpoint="/api/comments"
      features={{ screenshots: true, textAnchors: true }}
    />
  )
}
