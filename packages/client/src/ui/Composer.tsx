// packages/client/src/ui/Composer.tsx
import type { Attachment } from '@airnauts/comments-core'
import { type ChangeEvent, useEffect, useRef, useState } from 'react'
import type { Identity } from '../identity/storage'
import { cn } from '../lib/cn'
import { PendingAttachment, type PendingStatus } from './Attachment'

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
}

type Pending = { name: string; status: PendingStatus; id?: string; file: File }

export function Composer({
  mode,
  identity,
  onNeedIdentity,
  onSubmit,
  upload,
  onCancel,
  autoFocus,
}: ComposerProps) {
  const [text, setText] = useState('')
  const [pending, setPending] = useState<Pending | null>(null)
  const [sending, setSending] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus()
  }, [autoFocus])

  const attachmentReady = !pending || pending.status === 'ready'
  const canSend = text.trim().length > 0 && attachmentReady && !sending

  function startUpload(file: File) {
    setPending({ name: file.name, status: 'uploading', file })
    upload(file)
      .then((att) =>
        setPending((p) => (p && p.file === file ? { ...p, status: 'ready', id: att.id } : p)),
      )
      .catch(() => setPending((p) => (p && p.file === file ? { ...p, status: 'error' } : p)))
  }

  function onPick(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-selecting the same file
    if (file) startUpload(file)
  }

  function doSend(who: Identity) {
    const attachmentIds = pending?.id ? [pending.id] : []
    setSending(true)
    onSubmit({ text: text.trim(), attachmentIds, who })
      .then(() => {
        setText('')
        setPending(null)
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
          onRemove={() => setPending(null)}
          onRetry={() => startUpload(pending.file)}
        />
      )}
      <div className="cmnt:flex cmnt:items-center cmnt:gap-2">
        <button
          type="button"
          aria-label="Attach image"
          onClick={() => fileRef.current?.click()}
          className="cmnt:bg-transparent cmnt:border-none cmnt:cursor-pointer cmnt:text-base cmnt:text-gray-400"
        >
          📎
        </button>
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
          <button
            type="button"
            onClick={onCancel}
            className="cmnt:bg-white cmnt:border cmnt:border-gray-300 cmnt:rounded-md cmnt:px-[11px] cmnt:py-[5px] cmnt:text-xs cmnt:font-semibold cmnt:text-gray-600 cmnt:cursor-pointer"
          >
            Cancel
          </button>
        )}
        <button
          type="button"
          onClick={onSendClick}
          disabled={!canSend}
          className={cn(
            'cmnt:text-white cmnt:rounded-md cmnt:px-[11px] cmnt:py-[5px] cmnt:text-xs cmnt:font-semibold cmnt:border-none',
            canSend
              ? 'cmnt:bg-blue-600 cmnt:cursor-pointer'
              : 'cmnt:bg-[#93b4f5] cmnt:cursor-default',
          )}
        >
          Send
        </button>
      </div>
    </div>
  )
}
