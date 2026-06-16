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
      <div data-portal-container ref={setPortal} className="air:absolute" />
      <div
        data-toasts-container
        ref={setToasts}
        className="air:absolute air:bottom-4 air:right-4 air:pointer-events-none"
      />
    </ContainerContext.Provider>
  )
}
