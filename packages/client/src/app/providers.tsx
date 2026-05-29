import { createContext, type ReactNode, useContext, useState } from 'react'

type Containers = {
  portal: HTMLElement | null
  toasts: HTMLElement | null
}

const ContainerContext = createContext<Containers>({ portal: null, toasts: null })

export function usePortalContainer(): HTMLElement | null {
  return useContext(ContainerContext).portal
}

export function useToastsContainer(): HTMLElement | null {
  return useContext(ContainerContext).toasts
}

export function WidgetProvider({ children }: { children: ReactNode }) {
  const [portal, setPortal] = useState<HTMLElement | null>(null)
  const [toasts, setToasts] = useState<HTMLElement | null>(null)

  return (
    <ContainerContext.Provider value={{ portal, toasts }}>
      {children}
      <div data-portal-container ref={setPortal} className="cmnt:absolute" />
      <div
        data-toasts-container
        ref={setToasts}
        className="cmnt:absolute cmnt:bottom-4 cmnt:right-4 cmnt:pointer-events-none"
      />
    </ContainerContext.Provider>
  )
}
