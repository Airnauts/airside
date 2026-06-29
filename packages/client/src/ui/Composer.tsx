// packages/client/src/ui/Composer.tsx
import type { Attachment } from '@airnauts/airside-core'
import {
  type ClipboardEvent,
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react'
import { useIdentity } from '../identity/IdentityProvider'
import type { Identity } from '../identity/storage'
import { cn } from '../lib/cn'
import { PendingAttachment } from './Attachment'
import { Button } from './Button'
import { DropOverlay, useImageDrop } from './imageDrop'
import {
  CLIENT_ALLOWED_IMAGE_TYPES,
  type ClientAllowedImageType,
  namePastedImage,
  validateImageFile,
} from './imageInput'
import { useToast } from './toast'
import { useAttachmentUpload } from './useAttachmentUpload'

export type ComposerSubmit = { text: string; attachmentIds: string[]; who: Identity }

/** Imperative handle so a host that owns a larger drop region (the conversation
 *  panel) can route a dropped file back into this composer's upload pipeline. */
export type ComposerHandle = { acceptFiles: (files: File[]) => void }

export type ComposerProps = {
  mode: 'newThread' | 'reply'
  onSubmit: (payload: ComposerSubmit) => Promise<void>
  upload: (file: File) => Promise<Attachment>
  /** When set, renders a Cancel button left of Send (used by the new-comment draft). */
  onCancel?: () => void
  /** Focus the text input on mount (deferred a frame to win against Radix focus scopes).
   *  Defaults to true — every composer placement (popover reply, sidebar reply, new-thread
   *  draft) grabs the input so the user can type immediately. */
  autoFocus?: boolean
  /** Controlled text. When provided, the parent owns the draft text (shared-draft sync). */
  value?: string
  onValueChange?: (text: string) => void
  /** Controlled stored attachment (after upload). When `onAttachmentChange` is provided,
   *  a completed upload is lifted to the parent and rendered from `attachment.url`. */
  attachment?: Attachment | null
  onAttachmentChange?: (attachment: Attachment | null) => void
  /** When a host owns a larger drop region (the conversation panel) and forwards
   *  drops via the imperative handle, set this so the composer doesn't also wire its
   *  own drop handlers/overlay — that would double-fire the drop. Paste and the file
   *  picker stay active either way. */
  externalDrop?: boolean
}

export const Composer = forwardRef<ComposerHandle, ComposerProps>(function Composer(
  {
    mode,
    onSubmit,
    upload,
    onCancel,
    autoFocus = true,
    value,
    onValueChange,
    attachment,
    onAttachmentChange,
    externalDrop = false,
  },
  ref,
) {
  const { identity, requestIdentity } = useIdentity()
  const [internalText, setInternalText] = useState('')
  const textControlled = value !== undefined
  const text = textControlled ? value : internalText
  const setText = (next: string) => {
    if (textControlled) onValueChange?.(next)
    else setInternalText(next)
  }
  const att = useAttachmentUpload({ upload, attachment, onAttachmentChange })
  const toast = useToast()
  const [sending, setSending] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!autoFocus) return
    // Defer past the Radix Dialog's own focus handling: a synchronous mount-time focus() is
    // reclaimed by the dialog's focus scope, leaving the input blurred. Focusing on the next
    // frame lets the reply input reliably win.
    const raf = requestAnimationFrame(() => inputRef.current?.focus())
    return () => cancelAnimationFrame(raf)
  }, [autoFocus])

  const hasContent = text.trim().length > 0 || att.hasAttachment
  const canSend = hasContent && att.ready && !sending

  function doSend(who: Identity) {
    setSending(true)
    onSubmit({ text: text.trim(), attachmentIds: att.attachmentIds, who })
      .then(() => {
        setText('')
        att.reset()
      })
      .catch(() => {
        /* caller surfaces the error (toast); keep the draft so the user can retry */
      })
      .finally(() => setSending(false))
  }

  function onSendClick() {
    if (!canSend) return
    if (identity) doSend(identity)
    else requestIdentity((who) => doSend(who))
  }

  // Validate then upload (replacing any current attachment), or toast the reason.
  function acceptImage(file: File) {
    const result = validateImageFile(file)
    if (result.ok) att.startUpload(file)
    else if (result.reason === 'size') toast('Image too large (max 5 MB)')
    else toast('Unsupported image type')
  }

  // From a dropped/forwarded file list: take the first image (single-image v1), ignore the
  // rest, toast if none are images.
  function acceptFiles(files: File[]) {
    const image = files.find((f) => f.type.startsWith('image/'))
    if (image) acceptImage(image)
    else toast('Unsupported image type')
  }

  // No deps array on purpose: `acceptFiles` closes over `att.startUpload`, which is recreated
  // each render, so the handle must be too — a frozen one would upload through a stale closure.
  useImperativeHandle(ref, () => ({ acceptFiles }))

  // The composer wires its own drop region unless a host owns a larger one (see `externalDrop`).
  const { dragActive, dropHandlers } = useImageDrop(acceptFiles)

  function onPaste(e: ClipboardEvent) {
    const items = e.clipboardData?.items
    if (!items) return
    for (const item of Array.from(items)) {
      if (
        item.kind === 'file' &&
        CLIENT_ALLOWED_IMAGE_TYPES.includes(item.type as ClientAllowedImageType)
      ) {
        const blob = item.getAsFile()
        if (!blob) continue
        // Only swallow the paste once we've found an image — plain-text paste stays unaffected.
        e.preventDefault()
        acceptImage(namePastedImage(blob))
        return
      }
    }
  }

  const placeholder = mode === 'newThread' ? 'Add a comment…' : 'Reply…'

  return (
    <div
      className="air:relative air:border-t air:first:border-t-0 air:border-[#f1f3f5] air:px-3 air:py-[9px]"
      {...(externalDrop ? {} : dropHandlers)}
      onPaste={onPaste}
    >
      {!externalDrop && dragActive && <DropOverlay testId="composer-dropzone" />}
      {att.pending && (
        <PendingAttachment
          name={att.pending.name}
          status={att.pending.status}
          previewUrl={att.pending.previewUrl}
          onRemove={att.clearPending}
          onRetry={() => att.pending && att.startUpload(att.pending.file)}
        />
      )}
      {!att.pending && att.readyAttachment && (
        <PendingAttachment
          name={att.readyAttachment.name}
          status="ready"
          previewUrl={att.readyAttachment.url}
          onRemove={att.removeReady}
          onRetry={() => {}}
        />
      )}
      <div className="air:flex air:items-center air:gap-2">
        <Button
          variant="ghost"
          size="icon"
          aria-label="Attach image"
          onClick={() => fileRef.current?.click()}
          className="air:text-base air:text-gray-400"
        >
          📎
        </Button>
        <input
          ref={fileRef}
          data-testid="composer-file"
          type="file"
          accept="image/*"
          onChange={att.onPick}
          className="air:hidden"
        />
        <input
          ref={inputRef}
          aria-label={placeholder}
          placeholder={placeholder}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              onSendClick()
            }
          }}
          // min-w-0 lets flex-1 shrink the input below its intrinsic min-width so the
          // 📎 + input + Cancel + Send row fits within the fixed w-80 popover (Send was
          // being clipped by overflow-hidden because a flex item defaults to min-width:auto).
          className="air:flex-1 air:min-w-0 air:border-none air:outline-none air:text-[13px] air:bg-transparent"
        />
        {onCancel && (
          <Button variant="outline" size="sm" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button
          variant="primary"
          size="sm"
          onClick={onSendClick}
          disabled={!canSend}
          className={cn(!canSend && 'air:bg-[#93b4f5]')}
        >
          Send
        </Button>
      </div>
    </div>
  )
})
