import * as Dialog from '@radix-ui/react-dialog'
import { type FormEvent, useState } from 'react'
import { usePortalContainer } from '../app/providers'
import { Button } from '../ui/Button'
import type { Identity } from './storage'

export type IdentityModalProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (identity: Identity) => void
}

export function IdentityModal({ open, onOpenChange, onSubmit }: IdentityModalProps) {
  const container = usePortalContainer()
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')

  function submit(e: FormEvent) {
    e.preventDefault()
    const trimmed = email.trim()
    if (!trimmed) return
    onSubmit({ email: trimmed, name: name.trim() || undefined })
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal container={container ?? undefined}>
        <Dialog.Overlay className="cmnt:fixed cmnt:inset-0 cmnt:bg-black/40 cmnt:pointer-events-auto" />
        <Dialog.Content className="cmnt:fixed cmnt:top-1/2 cmnt:left-1/2 cmnt:-translate-x-1/2 cmnt:-translate-y-1/2 cmnt:bg-white cmnt:p-6 cmnt:rounded-xl cmnt:min-w-80 cmnt:pointer-events-auto">
          <Dialog.Title className="cmnt:mt-0">Log in to comment</Dialog.Title>
          <Dialog.Description>
            Used only to label your comments. No verification, and no email is ever sent.
          </Dialog.Description>
          <form onSubmit={submit}>
            <input
              aria-label="Email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="cmnt:block cmnt:w-full cmnt:my-3 cmnt:p-2 cmnt:border cmnt:border-gray-300 cmnt:rounded"
            />
            <input
              aria-label="Name (optional)"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Name (optional)"
              className="cmnt:block cmnt:w-full cmnt:my-3 cmnt:p-2 cmnt:border cmnt:border-gray-300 cmnt:rounded"
            />
            <Button variant="primary" size="md" type="submit">
              Log in
            </Button>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
