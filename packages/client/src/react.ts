import { useEffect } from 'react'
import { type CommentsHandle, comments, type InitOptions } from './index'

export const packageName = '@airnauts/comments-client/react'

export type CommentsLayerProps = Omit<InitOptions, 'key'> & {
  /** The secret key (React reserves the `key` prop name, so it is `commentsKey` here). */
  commentsKey: string
}

/** Thin wrapper for React hosts: calls comments.init() in an effect and tears down on unmount. */
export function CommentsLayer({ commentsKey, ...rest }: CommentsLayerProps): null {
  // Re-init only on connection-identity change (key/endpoint/keyParam), not on every
  // prop-object change — intentionally narrower than exhaustive deps.
  // biome-ignore lint/correctness/useExhaustiveDependencies: connection-scoped deps by design
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
  }, [commentsKey, rest.endpoint, rest.keyParam])
  return null
}
