// packages/client/src/marker/useFocusPin.ts
import { useEffect } from 'react'
import type { Action } from '../threads/state'

export type UseFocusPinArgs = {
  pendingFocusId: string | null
  /** The currently-focused thread; its pin pulses until cleared. */
  focusedId: string | null
  /** Whether the pending target currently has placement geometry in the store. */
  placed: boolean
  getElement: (id: string) => Element | null
  dispatch: (a: Action) => void
  toast: (message: string) => void
  /** How long to wait for a placement before declaring the anchor lost. */
  timeoutMs?: number
}

/** Pulse duration after a pin is focused. Pairs with the cmnt:animate-ping on the focused Pin. */
const PULSE_MS = 1500

export function useFocusPin({
  pendingFocusId,
  focusedId,
  placed,
  getElement,
  dispatch,
  toast,
  timeoutMs = 2000,
}: UseFocusPinArgs) {
  // Wait for the pending target's placement, then scroll + confirm; or time out → lost-anchor toast.
  useEffect(() => {
    if (!pendingFocusId) return
    if (placed) {
      const el = getElement(pendingFocusId)
      try {
        el?.scrollIntoView({ block: 'center', behavior: 'smooth' })
      } catch {
        /* jsdom / unsupported — focus still proceeds */
      }
      dispatch({ type: 'FOCUS_PLACED', id: pendingFocusId })
      return
    }
    const giveUp = window.setTimeout(() => {
      toast('This comment’s anchor was lost')
      dispatch({ type: 'CLEAR_PENDING_FOCUS' })
    }, timeoutMs)
    return () => window.clearTimeout(giveUp)
  }, [pendingFocusId, placed, getElement, dispatch, toast, timeoutMs])

  // Pulse lifecycle is its OWN effect keyed on focusedId, so the placement effect re-running
  // (when FOCUS_PLACED nulls pendingFocusId) can't cancel the pulse timer.
  useEffect(() => {
    if (!focusedId) return
    const clear = window.setTimeout(() => dispatch({ type: 'CLEAR_FOCUS' }), PULSE_MS)
    return () => window.clearTimeout(clear)
  }, [focusedId, dispatch])
}
