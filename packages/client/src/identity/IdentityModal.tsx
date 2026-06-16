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
        <Dialog.Overlay className="air:fixed air:inset-0 air:bg-black/40 air:pointer-events-auto" />
        <Dialog.Content className="air:fixed air:top-1/2 air:left-1/2 air:-translate-x-1/2 air:-translate-y-1/2 air:bg-white air:p-6 air:rounded-xl air:min-w-80 air:pointer-events-auto">
          <Dialog.Title className="air:mt-0 air:text-[18px] air:font-semibold air:text-gray-900">
            Log in to comment
          </Dialog.Title>
          <Dialog.Description className="air:mt-1 air:text-sm air:text-gray-500">
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
              className="air:block air:w-full air:my-3 air:p-2 air:text-sm air:border air:border-gray-300 air:rounded-[4px]"
            />
            <input
              aria-label="Name (optional)"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Name (optional)"
              className="air:block air:w-full air:my-3 air:p-2 air:text-sm air:border air:border-gray-300 air:rounded-[4px]"
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
