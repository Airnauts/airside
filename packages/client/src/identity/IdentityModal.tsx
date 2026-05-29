import * as Dialog from '@radix-ui/react-dialog'
import { type FormEvent, useState } from 'react'
import { usePortalContainer } from '../app/providers'
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
        <Dialog.Overlay style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', pointerEvents: 'auto' }} />
        <Dialog.Content
          style={{
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            background: '#fff',
            padding: 24,
            borderRadius: 12,
            minWidth: 320,
            pointerEvents: 'auto',
          }}
        >
          <Dialog.Title style={{ marginTop: 0 }}>Enter your email</Dialog.Title>
          <Dialog.Description>Used only to label your comments. No verification, and no email is ever sent.</Dialog.Description>
          <form onSubmit={submit}>
            <input
              aria-label="Email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              style={{ display: 'block', width: '100%', margin: '12px 0', padding: 8 }}
            />
            <input
              aria-label="Name (optional)"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Name (optional)"
              style={{ display: 'block', width: '100%', margin: '12px 0', padding: 8 }}
            />
            <button type="submit">Start commenting</button>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
