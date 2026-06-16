import type { Attachment } from '@airnauts/airside-core'

export type Draft = { text: string; attachment: Attachment | null }

export const EMPTY_DRAFT: Draft = { text: '', attachment: null }

export type DraftsState = Record<string, Draft>

export type DraftAction =
  | { type: 'SET_TEXT'; id: string; text: string }
  | { type: 'SET_ATTACHMENT'; id: string; attachment: Attachment | null }
  | { type: 'CLEAR'; id: string }

function patch(state: DraftsState, id: string, next: Partial<Draft>): DraftsState {
  const current = state[id] ?? EMPTY_DRAFT
  return { ...state, [id]: { ...current, ...next } }
}

export function draftsReducer(state: DraftsState, action: DraftAction): DraftsState {
  switch (action.type) {
    case 'SET_TEXT':
      return patch(state, action.id, { text: action.text })
    case 'SET_ATTACHMENT':
      return patch(state, action.id, { attachment: action.attachment })
    case 'CLEAR': {
      const { [action.id]: _gone, ...rest } = state
      return rest
    }
    default:
      return state
  }
}
