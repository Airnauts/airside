// packages/client/src/ui/useAttachmentUpload.ts
import type { Attachment } from '@airnauts/comments-core'
import { type ChangeEvent, useEffect, useRef, useState } from 'react'
import type { PendingStatus } from './Attachment'

export type PendingUpload = {
  name: string
  status: PendingStatus
  id?: string
  file: File
  previewUrl: string
}

export type UseAttachmentUploadOptions = {
  upload: (file: File) => Promise<Attachment>
  /** Controlled stored attachment (after upload). When `onAttachmentChange` is provided,
   *  a completed upload is lifted to the parent and rendered from `attachment.url`. */
  attachment?: Attachment | null
  onAttachmentChange?: (attachment: Attachment | null) => void
}

/**
 * The composer's single-image attachment lifecycle: pick → object-URL preview →
 * upload (retry on error) → ready. In controlled mode the stored attachment is
 * lifted to the parent; otherwise it stays in local pending state until send.
 */
export function useAttachmentUpload({
  upload,
  attachment,
  onAttachmentChange,
}: UseAttachmentUploadOptions) {
  const controlled = onAttachmentChange !== undefined
  const [pending, setPending] = useState<PendingUpload | null>(null)
  // Mirrors the current preview object URL so the unmount cleanup can revoke it
  // without re-subscribing on every pending change.
  const previewUrlRef = useRef<string | null>(null)

  // Revoke any outstanding object URL when the owner unmounts.
  useEffect(
    () => () => {
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
    },
    [],
  )

  // Drop the pending attachment and revoke its preview URL (remove, send, or replace).
  function clearPending() {
    setPending((p) => {
      if (p?.previewUrl) URL.revokeObjectURL(p.previewUrl)
      return null
    })
    previewUrlRef.current = null
  }

  function startUpload(file: File) {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current) // replacing a prior pick
    const previewUrl = URL.createObjectURL(file)
    previewUrlRef.current = previewUrl
    setPending({ name: file.name, status: 'uploading', file, previewUrl })
    upload(file)
      .then((att) => {
        if (controlled) {
          onAttachmentChange?.(att)
          clearPending() // server URL now drives the thumbnail in both surfaces
        } else {
          setPending((p) => (p && p.file === file ? { ...p, status: 'ready', id: att.id } : p))
        }
      })
      .catch(() => setPending((p) => (p && p.file === file ? { ...p, status: 'error' } : p)))
  }

  function onPick(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-selecting the same file
    if (file) startUpload(file)
  }

  const readyAttachment = controlled ? (attachment ?? null) : null
  // No pending upload, or it finished — the composer may send.
  const ready = !pending || pending.status === 'ready'
  // A ready attachment is enough on its own — image-only comments are allowed.
  const hasAttachment = pending?.status === 'ready' || readyAttachment !== null
  const attachmentIds = controlled
    ? readyAttachment
      ? [readyAttachment.id]
      : []
    : pending?.id
      ? [pending.id]
      : []

  // Called after a successful send: release the attachment for the next draft.
  function reset() {
    if (controlled) onAttachmentChange?.(null)
    else clearPending()
  }

  return {
    pending,
    readyAttachment,
    ready,
    hasAttachment,
    attachmentIds,
    startUpload,
    onPick,
    clearPending,
    removeReady: () => onAttachmentChange?.(null),
    reset,
  }
}
