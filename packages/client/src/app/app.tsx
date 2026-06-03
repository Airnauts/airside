import { useRef, useState } from 'react'
import { type ApiClient, createApiClient } from '../api/client'
import { type InitOptions, resolvePageKey } from '../config'
import { WidgetErrorBoundary } from '../error-boundary'
import { IdentityModal } from '../identity/IdentityModal'
import { type Identity, loadIdentity, saveIdentity } from '../identity/storage'
import { MarkerLayer } from '../marker/MarkerLayer'
import { PanelDrawer } from '../panel/PanelDrawer'
import { PanelProvider } from '../panel/PanelProvider'
import { LoginLauncher } from '../ui/LoginLauncher'
import { ThreadsProvider } from '../threads/ThreadsProvider'
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
  const [identity, setIdentity] = useState<Identity | null>(() => loadIdentity())
  const [modalOpen, setModalOpen] = useState(false)
  const resumeRef = useRef<((identity: Identity) => void) | null>(null)

  const pageUrl = window.location.href
  const pageKey = resolvePageKey(options, pageUrl)

  function onNeedIdentity(resume: (identity: Identity) => void) {
    resumeRef.current = resume
    setModalOpen(true)
  }

  function onSubmitIdentity(who: Identity) {
    saveIdentity(who)
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
          <ThreadsProvider client={client}>
            <PanelProvider client={client}>
              {identity ? (
                <>
                  <MarkerLayer
                    client={client}
                    pageKey={pageKey}
                    pageUrl={pageUrl}
                    resolvePageKey={(url) => resolvePageKey(options, url)}
                    identity={identity}
                    onNeedIdentity={onNeedIdentity}
                    provenance={options.provenance}
                  />
                  <PanelDrawer resolvePageKey={(url) => resolvePageKey(options, url)} />
                </>
              ) : (
                <LoginLauncher onLogIn={() => setModalOpen(true)} />
              )}
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
        </ToastProvider>
      </WidgetProvider>
    </WidgetErrorBoundary>
  )
}
