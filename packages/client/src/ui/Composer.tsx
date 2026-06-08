// packages/client/src/ui/Composer.tsx
import type { Attachment } from '@airnauts/comments-core'
import { type ChangeEvent, useEffect, useRef, useState } from 'react'
import type { Identity } from '../identity/storage'
import { cn } from '../lib/cn'
import { PendingAttachment, type PendingStatus } from './Attachment'
import { Button } from './Button'

export type ComposerSubmit = { text: string; attachmentIds: string[]; who: Identity }

export type ComposerProps = {
  mode: 'newThread' | 'reply'
  identity: Identity | null
  onNeedIdentity: (resume: (who: Identity) => void) => void
  onSubmit: (payload: ComposerSubmit) => Promise<void>
  upload: (file: File) => Promise<Attachment>
  /** When set, renders a Cancel button left of Send (used by the new-comment draft). */
  onCancel?: () => void
  /** Focus the text input on mount. */
  autoFocus?: boolean
  /** Controlled text. When provided, the parent owns the draft text (shared-draft sync). */
  value?: string
  onValueChange?: (text: string) => void
  /** Controlled stored attachment (after upload). When `onAttachmentChange` is provided,
   *  a completed upload is lifted to the parent and rendered from `attachment.url`. */
  attachment?: Attachment | null
  onAttachmentChange?: (attachment: Attachment | null) => void
}

type Pending = { name: string; status: PendingStatus; id?: string; file: File; previewUrl: string }

export function Composer({
  mode,
  identity,
  onNeedIdentity,
  onSubmit,
  upload,
  onCancel,
  autoFocus,
  value,
  onValueChange,
  attachment,
  onAttachmentChange,
}: ComposerProps) {
  const [internalText, setInternalText] = useState('')
  const textControlled = value !== undefined
  const text = textControlled ? value : internalText
  const setText = (next: string) => {
    if (textControlled) onValueChange?.(next)
    else setInternalText(next)
  }
  const attControlled = onAttachmentChange !== undefined
  const [pending, setPending] = useState<Pending | null>(null)
  const [sending, setSending] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  // Mirrors the current preview object URL so the unmount cleanup can revoke it
  // without re-subscribing on every pending change.
  const previewUrlRef = useRef<string | null>(null)

  useEffect(() => {
    if (!autoFocus) return
    // Defer past the Radix Dialog's own focus handling: a synchronous mount-time focus() is
    // reclaimed by the dialog's focus scope, leaving the input blurred. Focusing on the next
    // frame lets the reply input reliably win.
    const raf = requestAnimationFrame(() => inputRef.current?.focus())
    return () => cancelAnimationFrame(raf)
  }, [autoFocus])

  // Revoke any outstanding object URL when the composer unmounts.
  useEffect(
    () => () => {
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
    },
    [],
  )

  const attachmentReady = !pending || pending.status === 'ready'
  const readyAttachment = attControlled ? (attachment ?? null) : null
  // A ready attachment is enough on its own — image-only comments are allowed.
  const hasContent =
    text.trim().length > 0 || pending?.status === 'ready' || readyAttachment !== null
  const canSend = hasContent && attachmentReady && !sending

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
        if (attControlled) {
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

  function doSend(who: Identity) {
    const attachmentIds = attControlled
      ? readyAttachment
        ? [readyAttachment.id]
        : []
      : pending?.id
        ? [pending.id]
        : []
    setSending(true)
    onSubmit({ text: text.trim(), attachmentIds, who })
      .then(() => {
        setText('')
        if (attControlled) onAttachmentChange?.(null)
        else clearPending()
      })
      .catch(() => {
        /* caller surfaces the error (toast); keep the draft so the user can retry */
      })
      .finally(() => setSending(false))
  }

  function onSendClick() {
    if (!canSend) return
    if (identity) doSend(identity)
    else onNeedIdentity((who) => doSend(who))
  }

  const placeholder = mode === 'newThread' ? 'Add a comment…' : 'Reply…'

  return (
    <div className="cmnt:border-t cmnt:first:border-t-0 cmnt:border-[#f1f3f5] cmnt:px-3 cmnt:py-[9px]">
      {pending && (
        <PendingAttachment
          name={pending.name}
          status={pending.status}
          previewUrl={pending.previewUrl}
          onRemove={clearPending}
          onRetry={() => startUpload(pending.file)}
        />
      )}
      {!pending && readyAttachment && (
        <PendingAttachment
          name={readyAttachment.name}
          status="ready"
          previewUrl={readyAttachment.url}
          onRemove={() => onAttachmentChange?.(null)}
          onRetry={() => {}}
        />
      )}
      <div className="cmnt:flex cmnt:items-center cmnt:gap-2">
        <Button
          variant="ghost"
          size="icon"
          aria-label="Attach image"
          onClick={() => fileRef.current?.click()}
          className="cmnt:text-base cmnt:text-gray-400"
        >
          📎
        </Button>
        <input
          ref={fileRef}
          data-testid="composer-file"
          type="file"
          accept="image/*"
          onChange={onPick}
          className="cmnt:hidden"
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
          className="cmnt:flex-1 cmnt:min-w-0 cmnt:border-none cmnt:outline-none cmnt:text-[13px] cmnt:bg-transparent"
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
          className={cn(!canSend && 'cmnt:bg-[#93b4f5]')}
        >
          Send
        </Button>
      </div>
    </div>
  )
}
