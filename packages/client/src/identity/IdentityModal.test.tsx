import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { WidgetProvider } from '../app/providers'
import { IdentityModal } from './IdentityModal'

describe('IdentityModal', () => {
  it('submits the entered email (and optional name)', () => {
    const onSubmit = vi.fn()
    render(
      <WidgetProvider>
        <IdentityModal open onOpenChange={() => {}} onSubmit={onSubmit} />
      </WidgetProvider>,
    )

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'rev@example.com' } })
    fireEvent.change(screen.getByLabelText('Name (optional)'), { target: { value: 'Rev' } })
    fireEvent.click(screen.getByRole('button', { name: /log in/i }))

    expect(onSubmit).toHaveBeenCalledWith({ email: 'rev@example.com', name: 'Rev' })
  })

  it('does not submit when email is empty', () => {
    const onSubmit = vi.fn()
    render(
      <WidgetProvider>
        <IdentityModal open onOpenChange={() => {}} onSubmit={onSubmit} />
      </WidgetProvider>,
    )
    fireEvent.click(screen.getByRole('button', { name: /log in/i }))
    expect(onSubmit).not.toHaveBeenCalled()
  })
})
