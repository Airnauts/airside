// packages/client/src/whatsnew/WhatsNewProvider.tsx

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useIdentity } from '../identity/IdentityProvider'
import { getSetting, setSetting } from '../settings/store'
import { HIGHLIGHTS, type Highlight } from './highlights'
import { entriesNewerThan, latestVersion } from './version'
import { WhatsNewModal } from './WhatsNewModal'

export type WhatsNewContextValue = {
  /** Open the modal on demand with the latest release's highlights. */
  openWhatsNew: () => void
  /** The latest announced release, or null when no highlights exist. */
  latest: Highlight | null
}

const WhatsNewContext = createContext<WhatsNewContextValue | null>(null)

/**
 * Owns the "what's new" modal: auto-shows it once per new version (gated on an identity being
 * present, so it never stacks on the login launcher/modal) and exposes {@link useWhatsNew} for
 * the manual re-open trigger in the panel header.
 *
 * Auto-show, run once per mount when an identity is present:
 * - stored last-seen is `null` (brand-new reviewer, or one predating this feature) → seed the
 *   setting silently to the latest version and show nothing;
 * - stored last-seen is older than the latest highlight → open with every newer entry,
 *   newest first;
 * - stored last-seen equals the latest → do nothing.
 * Dismissing the modal (button / overlay / Escape) persists the latest version.
 */
export function WhatsNewProvider({ children }: { children: ReactNode }) {
  const { identity } = useIdentity()
  const [open, setOpen] = useState(false)
  const [entries, setEntries] = useState<Highlight[]>([])
  const autoShownRef = useRef(false)

  useEffect(() => {
    if (!identity || autoShownRef.current) return
    autoShownRef.current = true
    const lastSeen = getSetting('whatsNewSeen')
    if (lastSeen === null) {
      // First-ever load: seed silently so historical releases never popup.
      setSetting('whatsNewSeen', latestVersion())
      return
    }
    const newer = entriesNewerThan(lastSeen)
    if (newer.length > 0) {
      setEntries(newer)
      setOpen(true)
    }
  }, [identity])

  const openWhatsNew = useCallback(() => {
    const latest = HIGHLIGHTS[0]
    setEntries(latest ? [latest] : [])
    setOpen(true)
  }, [])

  const value = useMemo(() => ({ openWhatsNew, latest: HIGHLIGHTS[0] ?? null }), [openWhatsNew])

  function onOpenChange(next: boolean) {
    setOpen(next)
    // Any dismissal marks the latest release as seen (re-persisting is a no-op).
    if (!next) setSetting('whatsNewSeen', latestVersion())
  }

  return (
    <WhatsNewContext.Provider value={value}>
      {children}
      <WhatsNewModal open={open} onOpenChange={onOpenChange} entries={entries} />
    </WhatsNewContext.Provider>
  )
}

export function useWhatsNew(): WhatsNewContextValue {
  const ctx = useContext(WhatsNewContext)
  if (!ctx) throw new Error('useWhatsNew must be used within a WhatsNewProvider')
  return ctx
}
