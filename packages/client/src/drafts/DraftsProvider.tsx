import type { Attachment } from '@airnauts/airside-core'
import { createContext, type ReactNode, useContext, useMemo, useReducer } from 'react'
import { type Draft, type DraftsState, draftsReducer, EMPTY_DRAFT } from './state'

type DraftsContextValue = {
  state: DraftsState
  dispatch: (a: Parameters<typeof draftsReducer>[1]) => void
}

const DraftsContext = createContext<DraftsContextValue | null>(null)

export function DraftsProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(draftsReducer, {} as DraftsState)
  const value = useMemo(() => ({ state, dispatch }), [state])
  return <DraftsContext.Provider value={value}>{children}</DraftsContext.Provider>
}

export function useDraft(id: string): {
  draft: Draft
  setText: (text: string) => void
  setAttachment: (attachment: Attachment | null) => void
  clear: () => void
} {
  const ctx = useContext(DraftsContext)
  if (!ctx) throw new Error('useDraft must be used within <DraftsProvider>')
  const { state, dispatch } = ctx
  const draft = state[id] ?? EMPTY_DRAFT
  return useMemo(
    () => ({
      draft,
      setText: (text) => dispatch({ type: 'SET_TEXT', id, text }),
      setAttachment: (attachment) => dispatch({ type: 'SET_ATTACHMENT', id, attachment }),
      clear: () => dispatch({ type: 'CLEAR', id }),
    }),
    [draft, dispatch, id],
  )
}
