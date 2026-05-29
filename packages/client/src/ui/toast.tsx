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
              className="cmnt:pointer-events-auto cmnt:bg-gray-800 cmnt:text-white cmnt:px-3 cmnt:py-2 cmnt:rounded-lg cmnt:mt-2"
            >
              {t.message}
            </div>
          )),
          container,
        )}
    </ToastContext.Provider>
  )
}
