import { render, screen } from '@testing-library/react'
import { useEffect } from 'react'
import { describe, expect, it } from 'vitest'
import { WidgetProvider } from '../app/providers'
import { ToastProvider, useToast } from './toast'

function Pusher({ message }: { message: string }) {
  const toast = useToast()
  useEffect(() => toast(message), [toast, message])
  return null
}

describe('toast', () => {
  it('renders a pushed toast into the toasts container', async () => {
    render(
      <WidgetProvider>
        <ToastProvider>
          <Pusher message="something failed" />
        </ToastProvider>
      </WidgetProvider>,
    )
    expect(await screen.findByText('something failed')).toBeInTheDocument()
  })
})
