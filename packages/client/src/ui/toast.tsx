import { createContext, type ReactNode, useCallback, useContext, useState } from 'react'
import { createPortal } from 'react-dom'
import { useToastsContainer } from '../app/providers'

type ToastItem = { id: number; message: string }
type ToastFn = (message: string) => void

const ToastContext = createContext<ToastFn>(() => {})

export function useToast(): ToastFn {
  return useContext(ToastContext)
}

let nextToastId = 0

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const container = useToastsContainer()

  const push = useCallback<ToastFn>((message) => {
    const id = nextToastId++
    setItems((prev) => [...prev, { id, message }])
    setTimeout(() => setItems((prev) => prev.filter((t) => t.id !== id)), 4000)
  }, [])

  return (
    <ToastContext.Provider value={push}>
      {children}
      {container &&
        createPortal(
          items.map((t) => (
            <div
              key={t.id}
              role="status"
              data-comments-toast
              style={{
                pointerEvents: 'auto',
                background: '#1f2937',
                color: '#fff',
                padding: '8px 12px',
                borderRadius: 8,
                marginTop: 8,
              }}
            >
              {t.message}
            </div>
          )),
          container,
        )}
    </ToastContext.Provider>
  )
}
