// packages/client/src/launcher/useDraggablePosition.ts

import {
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useRef,
  useState,
} from 'react'
import { getSetting, setSetting } from '../settings/store'
import { clampTop, type LauncherPosition } from './storage'

/** Pointer travel (px) before a press becomes a drag rather than a click. */
const DRAG_THRESHOLD = 4

/** Inset (px) from the stuck edge. A literal — not a rem token — so a responsive host
 *  root font-size can't drift the launcher off the corner (see widget rem-independence note). */
const EDGE_INSET = '16px'

export type DraggablePosition = {
  position: LauncherPosition
  dragging: boolean
  /** Inline placement style; spread onto a `air:fixed` element. */
  style: CSSProperties
  /** Start a drag from anywhere on the element. */
  onPointerDown: (e: ReactPointerEvent) => void
  /** Swallows the click that trails a drag so the dragged-over button doesn't fire. */
  onClickCapture: (e: { preventDefault: () => void; stopPropagation: () => void }) => void
}

/** Makes an element draggable to either window edge, persisting `{edge, top%}`. The whole element
 *  is the drag surface; a press that doesn't move past the threshold still passes through as a
 *  click to whatever child was pressed. */
export function useDraggablePosition(): DraggablePosition {
  const [position, setPosition] = useState<LauncherPosition>(() => getSetting('launcherPosition'))
  const [dragging, setDragging] = useState(false)
  // True for the span between a drag's pointerup and the synthetic click it spawns; gates suppression.
  const movedRef = useRef(false)

  const onPointerDown = useCallback((e: ReactPointerEvent) => {
    if (e.button !== 0) return
    // Reset every press — touch drags often fire no trailing click, so we can't rely on
    // onClickCapture alone to clear the flag (it would eat the next genuine tap).
    movedRef.current = false
    const startX = e.clientX
    const startY = e.clientY
    let moved = false
    let next: LauncherPosition | null = null

    const onMove = (ev: PointerEvent) => {
      if (!moved && Math.hypot(ev.clientX - startX, ev.clientY - startY) < DRAG_THRESHOLD) return
      if (!moved) {
        moved = true
        movedRef.current = true
        setDragging(true)
      }
      next = {
        edge: ev.clientX < window.innerWidth / 2 ? 'left' : 'right',
        top: clampTop((ev.clientY / window.innerHeight) * 100),
      }
      setPosition(next)
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      if (moved && next) {
        setDragging(false)
        setSetting('launcherPosition', next)
      }
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }, [])

  const onClickCapture = useCallback(
    (e: { preventDefault: () => void; stopPropagation: () => void }) => {
      if (movedRef.current) {
        e.preventDefault()
        e.stopPropagation()
        movedRef.current = false
      }
    },
    [],
  )

  const style: CSSProperties = {
    top: `${position.top}%`,
    transform: 'translateY(-50%)',
    ...(position.edge === 'left' ? { left: EDGE_INSET } : { right: EDGE_INSET }),
  }

  return { position, dragging, style, onPointerDown, onClickCapture }
}
