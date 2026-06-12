// packages/client/src/identity/IdentityProvider.tsx
import { createContext, type ReactNode, useContext, useMemo } from 'react'
import type { Identity } from './storage'

export type IdentityContextValue = {
  /** The signed-in commenter, or null before the identity modal has been completed. */
  identity: Identity | null
  /**
   * Ask the host app shell to collect an identity (opens the modal), then call `resume`
   * with it so the interrupted action (send, place) can continue.
   */
  requestIdentity: (resume: (who: Identity) => void) => void
}

const IdentityContext = createContext<IdentityContextValue | null>(null)

export function IdentityProvider({
  identity,
  requestIdentity,
  children,
}: IdentityContextValue & { children: ReactNode }) {
  const value = useMemo(() => ({ identity, requestIdentity }), [identity, requestIdentity])
  return <IdentityContext.Provider value={value}>{children}</IdentityContext.Provider>
}

export function useIdentity(): IdentityContextValue {
  const ctx = useContext(IdentityContext)
  if (!ctx) throw new Error('useIdentity must be used within an IdentityProvider')
  return ctx
}
