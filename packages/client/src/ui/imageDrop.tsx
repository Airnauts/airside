// packages/client/src/ui/imageDrop.tsx
import { type DragEvent, useRef, useState } from 'react'

/**
 * Drag-and-drop plumbing for image files. Tracks a drag-active flag via an
 * enter/leave depth counter (not a bare boolean) so moving the drag over child
 * elements doesn't flicker the overlay off — a child-enter bumps the counter
 * before the parent-leave drops it back. Only reacts to drags that carry files;
 * selected-text / host-page element drags pass straight through.
 *
 * Spread `dropHandlers` on whatever element should be the drop region — make it
 * as large as you like (a whole conversation panel, not just a composer strip).
 */
export function useImageDrop(onFiles: (files: File[]) => void) {
  const [dragActive, setDragActive] = useState(false)
  const dragDepth = useRef(0)

  const hasFiles = (e: DragEvent) => e.dataTransfer?.types?.includes('Files') ?? false

  return {
    dragActive,
    dropHandlers: {
      onDragEnter(e: DragEvent) {
        if (!hasFiles(e)) return
        e.preventDefault()
        dragDepth.current += 1
        setDragActive(true)
      },
      onDragOver(e: DragEvent) {
        // preventDefault is required for the element to be a valid drop target.
        if (hasFiles(e)) e.preventDefault()
      },
      onDragLeave() {
        if (dragDepth.current === 0) return
        dragDepth.current -= 1
        if (dragDepth.current === 0) setDragActive(false)
      },
      onDrop(e: DragEvent) {
        if (!hasFiles(e)) return
        e.preventDefault()
        dragDepth.current = 0
        setDragActive(false)
        onFiles(Array.from(e.dataTransfer.files))
      },
    },
  }
}

/**
 * The "Drop image to attach" overlay shown while a file is dragged over a drop
 * region. Deliberately low-opacity (`bg-blue-50/40`) so the composer/content
 * underneath stays clearly visible through it, and `pointer-events-none` so it
 * never swallows the drop.
 */
export function DropOverlay({ testId }: { testId: string }) {
  return (
    <div
      aria-hidden
      data-testid={testId}
      className="air:absolute air:inset-0 air:z-20 air:flex air:items-center air:justify-center air:rounded-lg air:border-2 air:border-dashed air:border-blue-500 air:bg-blue-50/40 air:text-[13px] air:font-medium air:text-blue-700 air:pointer-events-none"
    >
      Drop image to attach
    </div>
  )
}
