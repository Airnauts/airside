// packages/client/src/ui/Attachment.test.tsx
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { PendingAttachment } from './Attachment'

describe('PendingAttachment', () => {
  it('shows a spinner while uploading and a remove button', () => {
    const onRemove = vi.fn()
    render(
      <PendingAttachment
        name="shot.png"
        status="uploading"
        onRemove={onRemove}
        onRetry={() => {}}
      />,
    )
    expect(screen.getByTestId('attachment-spinner')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /remove/i }))
    expect(onRemove).toHaveBeenCalled()
  })
  it('shows a retry on error', () => {
    const onRetry = vi.fn()
    render(
      <PendingAttachment name="shot.png" status="error" onRemove={() => {}} onRetry={onRetry} />,
    )
    fireEvent.click(screen.getByRole('button', { name: /retry/i }))
    expect(onRetry).toHaveBeenCalled()
  })
})
