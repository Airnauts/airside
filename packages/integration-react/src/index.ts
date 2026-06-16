import { type AirsideHandle, airside, type InitOptions } from '@airnauts/airside-client'
import { useEffect } from 'react'

export const packageName = '@airnauts/airside-integration-react'

export type AirsideLayerProps = Omit<InitOptions, 'key'> & {
  /** The secret key (React reserves the `key` prop name, so it is `airsideKey` here). */
  airsideKey: string
}

/** Thin wrapper for React hosts: calls airside.init() in an effect and tears down on unmount. */
export function AirsideLayer({ airsideKey, ...rest }: AirsideLayerProps): null {
  // Re-init only on connection-identity change (key/endpoint/keyParam), not on every
  // prop-object change — intentionally narrower than exhaustive deps.
  // biome-ignore lint/correctness/useExhaustiveDependencies: connection-scoped deps by design
  useEffect(() => {
    let handle: AirsideHandle | null = null
    let cancelled = false
    airside.init({ key: airsideKey, ...rest }).then((h) => {
      if (cancelled) h.destroy()
      else handle = h
    })
    return () => {
      cancelled = true
      handle?.destroy()
    }
  }, [airsideKey, rest.endpoint, rest.keyParam])
  return null
}
