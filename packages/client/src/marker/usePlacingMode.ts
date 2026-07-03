// packages/client/src/marker/usePlacingMode.ts
import { useEffect, useState } from 'react'
import { captureElement, captureSelection } from '../anchor/capture'
import { pinXY } from '../positioning/coords'
import type { Action } from '../threads/state'

/**
 * Place mode: while active, the next document click (or active text selection)
 * captures an anchor and opens a DRAFT popover; Escape cancels.
 */
export function usePlacingMode(dispatch: (a: Action) => void) {
  const [placing, setPlacing] = useState(false)

  useEffect(() => {
    if (!placing) return
    const onClick = (e: MouseEvent) => {
      const target = e.target as Element | null
      if (
        !target ||
        (target as HTMLElement).dataset?.airsidePlace !== undefined ||
        target.closest('[data-airside-overlay], [data-airside-chrome]')
      )
        return
      e.preventDefault()
      e.stopPropagation()
      setPlacing(false)
      const sel = window.getSelection()
      if (sel && !sel.isCollapsed && sel.rangeCount > 0) {
        const range = sel.getRangeAt(0)
        const anchor = captureSelection(range)
        const rect = range.getBoundingClientRect()
        dispatch({
          type: 'SET_DRAFT',
          draft: { anchor, point: { x: rect.left, y: rect.top }, pin: pinXY(rect, anchor.offset) },
        })
        return
      }
      const el = document.elementFromPoint?.(e.clientX, e.clientY) ?? target
      const anchor = captureElement(el, { x: e.clientX, y: e.clientY })
      const rect = el.getBoundingClientRect()
      dispatch({
        type: 'SET_DRAFT',
        draft: { anchor, point: { x: e.clientX, y: e.clientY }, pin: pinXY(rect, anchor.offset) },
      })
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPlacing(false)
    }
    document.addEventListener('click', onClick, true)
    document.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('click', onClick, true)
      document.removeEventListener('keydown', onKey, true)
    }
  }, [placing, dispatch])

  return { placing, setPlacing }
}
