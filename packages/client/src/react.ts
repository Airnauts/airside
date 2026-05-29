import { useEffect } from 'react'
import { type CommentsHandle, comments, type InitOptions } from './index'

export const packageName = '@comments/client/react'

export type CommentsLayerProps = Omit<InitOptions, 'key'> & {
  /** The secret key (React reserves the `key` prop name, so it is `commentsKey` here). */
  commentsKey: string
}

/** Thin wrapper for React hosts: calls comments.init() in an effect and tears down on unmount. */
export function CommentsLayer({ commentsKey, ...rest }: CommentsLayerProps): null {
  useEffect(() => {
    let handle: CommentsHandle | null = null
    let cancelled = false
    comments.init({ key: commentsKey, ...rest }).then((h) => {
      if (cancelled) h.destroy()
      else handle = h
    })
    return () => {
      cancelled = true
      handle?.destroy()
    }
    // Re-init only when the connection identity changes.
    // biome-ignore lint/correctness/useExhaustiveDependencies: intentional connection-scoped deps
  }, [commentsKey, rest.endpoint, rest.keyParam])
  return null
}
