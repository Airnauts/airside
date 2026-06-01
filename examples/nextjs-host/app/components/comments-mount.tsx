'use client'

import { CommentsLayer } from '@comments/client/react'

/**
 * Mounts the comments widget. `init()`'s gate keeps it inert until the page is
 * opened with `?comments-key=dev-key`, so this can render unconditionally.
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
