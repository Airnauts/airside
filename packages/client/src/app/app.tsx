import { useCallback, useRef, useState } from 'react'
import { type ApiClient, createApiClient } from '../api/client'
import { type InitOptions, resolvePageKey } from '../config'
import { DraftsProvider } from '../drafts/DraftsProvider'
import { WidgetErrorBoundary } from '../error-boundary'
import { IdentityModal } from '../identity/IdentityModal'
import { IdentityProvider } from '../identity/IdentityProvider'
import type { Identity } from '../identity/storage'
import { MarkerLayer } from '../marker/MarkerLayer'
import { PanelDrawer } from '../panel/PanelDrawer'
import { PanelProvider } from '../panel/PanelProvider'
import { getSetting, setSetting } from '../settings/store'
import { ThreadsProvider } from '../threads/ThreadsProvider'
import { LoginLauncher } from '../ui/LoginLauncher'
import { ToastProvider } from '../ui/toast'
import { WidgetProvider } from './providers'

export type WidgetAppProps = {
  options: InitOptions
  /** Test seam: inject a client instead of constructing one from `options`. */
  client?: ApiClient
}

export function WidgetApp({ options, client: injected }: WidgetAppProps) {
  const [client] = useState<ApiClient>(
    () => injected ?? createApiClient({ endpoint: options.endpoint, key: options.key }),
  )
  const [identity, setIdentity] = useState<Identity | null>(() => getSetting('identity'))
  const [modalOpen, setModalOpen] = useState(false)
  const resumeRef = useRef<((identity: Identity) => void) | null>(null)

  const pageUrl = window.location.href
  const pageKey = resolvePageKey(options, pageUrl)

  // Stable so the identity context value only changes when `identity` does —
  // a fresh function here would re-render every useIdentity consumer per app render.
  const requestIdentity = useCallback((resume: (identity: Identity) => void) => {
    resumeRef.current = resume
    setModalOpen(true)
  }, [])

  function onSubmitIdentity(who: Identity) {
    setSetting('identity', who)
    setIdentity(who)
    setModalOpen(false)
    const resume = resumeRef.current
    resumeRef.current = null
    resume?.(who)
  }

  return (
    <WidgetErrorBoundary>
      <WidgetProvider>
        <ToastProvider>
          <IdentityProvider identity={identity} requestIdentity={requestIdentity}>
            <ThreadsProvider client={client}>
              <PanelProvider client={client}>
                <DraftsProvider>
                  {identity ? (
                    <>
                      <MarkerLayer
                        client={client}
                        pageKey={pageKey}
                        pageUrl={pageUrl}
                        resolvePageKey={(url) => resolvePageKey(options, url)}
                        provenance={options.provenance}
                      />
                      <PanelDrawer
                        resolvePageKey={(url) => resolvePageKey(options, url)}
                        client={client}
                        provenance={options.provenance}
                      />
                    </>
                  ) : (
                    <LoginLauncher onLogIn={() => setModalOpen(true)} />
                  )}
                </DraftsProvider>
              </PanelProvider>
              <IdentityModal
                open={modalOpen}
                onOpenChange={(open) => {
                  if (!open) resumeRef.current = null
                  setModalOpen(open)
                }}
                onSubmit={onSubmitIdentity}
              />
            </ThreadsProvider>
          </IdentityProvider>
        </ToastProvider>
      </WidgetProvider>
    </WidgetErrorBoundary>
  )
}
