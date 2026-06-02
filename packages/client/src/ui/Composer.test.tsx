// packages/client/src/ui/Composer.test.tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { Composer } from './Composer'

const identity = { email: 'a@b.c', name: 'Ann' }

// jsdom doesn't implement object URLs; stub them so the preview lifecycle runs.
beforeAll(() => {
  URL.createObjectURL = vi.fn(() => 'blob:preview') as never
  URL.revokeObjectURL = vi.fn() as never
})

describe('Composer', () => {
  it('lets the text input shrink (min-w-0) so the row fits the fixed-width popover', () => {
    render(
      <Composer
        mode="reply"
        identity={identity}
        onNeedIdentity={(r) => r(identity)}
        onSubmit={vi.fn()}
        upload={vi.fn()}
      />,
    )
    // Without min-w-0, flex items keep min-width:auto and the input cannot shrink below its
    // intrinsic width — pushing Send past the w-80 popover edge (clipped by overflow-hidden).
    const input = screen.getByPlaceholderText(/reply/i)
    expect(input.className).toContain('cmnt:min-w-0')
    expect(input.className).toContain('cmnt:flex-1')
  })

  it('disables Send when empty and enables it with text', () => {
    render(
      <Composer
        mode="reply"
        identity={identity}
        onNeedIdentity={(r) => r(identity)}
        onSubmit={vi.fn()}
        upload={vi.fn()}
      />,
    )
    const send = screen.getByRole('button', { name: /send/i })
    expect(send).toBeDisabled()
    fireEvent.change(screen.getByPlaceholderText(/reply/i), { target: { value: 'hi' } })
    expect(send).toBeEnabled()
  })

  it('submits text + attachmentIds', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    render(
      <Composer
        mode="reply"
        identity={identity}
        onNeedIdentity={(r) => r(identity)}
        onSubmit={onSubmit}
        upload={vi.fn()}
      />,
    )
    fireEvent.change(screen.getByPlaceholderText(/reply/i), { target: { value: 'looks good' } })
    fireEvent.click(screen.getByRole('button', { name: /send/i }))
    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({
        text: 'looks good',
        attachmentIds: [],
        who: identity,
      }),
    )
  })

  it('prompts for identity when none is set, then resumes the send', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    const onNeedIdentity = vi.fn((resume: (i: typeof identity) => void) => resume(identity))
    render(
      <Composer
        mode="newThread"
        identity={null}
        onNeedIdentity={onNeedIdentity}
        onSubmit={onSubmit}
        upload={vi.fn()}
      />,
    )
    fireEvent.change(screen.getByPlaceholderText(/add a comment/i), { target: { value: 'first' } })
    fireEvent.click(screen.getByRole('button', { name: /send/i }))
    await waitFor(() => expect(onNeedIdentity).toHaveBeenCalled())
    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({ text: 'first', attachmentIds: [], who: identity }),
    )
  })

  it('uploads an attached file and gates Send until the upload resolves', async () => {
    let resolveUpload: (a: { id: string }) => void = () => {}
    const upload = vi.fn(
      () =>
        new Promise((res) => {
          resolveUpload = res as never
        }),
    )
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    render(
      <Composer
        mode="reply"
        identity={identity}
        onNeedIdentity={(r) => r(identity)}
        onSubmit={onSubmit}
        upload={upload as never}
      />,
    )
    fireEvent.change(screen.getByPlaceholderText(/reply/i), { target: { value: 'see shot' } })
    const file = new File(['x'], 'shot.png', { type: 'image/png' })
    fireEvent.change(screen.getByTestId('composer-file'), { target: { files: [file] } })
    expect(screen.getByRole('button', { name: /send/i })).toBeDisabled() // upload in flight
    resolveUpload({ id: 'at1' })
    await waitFor(() => expect(screen.getByRole('button', { name: /send/i })).toBeEnabled())
    fireEvent.click(screen.getByRole('button', { name: /send/i }))
    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({
        text: 'see shot',
        attachmentIds: ['at1'],
        who: identity,
      }),
    )
  })

  it('keeps Send disabled when the attachment upload errored', async () => {
    const upload = vi.fn().mockRejectedValue(new Error('nope'))
    render(
      <Composer
        mode="reply"
        identity={identity}
        onNeedIdentity={(r) => r(identity)}
        onSubmit={vi.fn()}
        upload={upload as never}
      />,
    )
    fireEvent.change(screen.getByPlaceholderText(/reply/i), { target: { value: 'see shot' } })
    const file = new File(['x'], 'shot.png', { type: 'image/png' })
    fireEvent.change(screen.getByTestId('composer-file'), { target: { files: [file] } })
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /retry upload/i })).toBeInTheDocument(),
    )
    expect(screen.getByRole('button', { name: /send/i })).toBeDisabled()
  })

  it('shows an image preview for the picked attachment', async () => {
    const upload = vi.fn().mockResolvedValue({ id: 'at1' })
    render(
      <Composer
        mode="reply"
        identity={identity}
        onNeedIdentity={(r) => r(identity)}
        onSubmit={vi.fn().mockResolvedValue(undefined)}
        upload={upload as never}
      />,
    )
    const file = new File(['x'], 'shot.png', { type: 'image/png' })
    fireEvent.change(screen.getByTestId('composer-file'), { target: { files: [file] } })
    const img = await screen.findByAltText('shot.png')
    expect(img).toHaveAttribute('src', 'blob:preview')
  })

  it('allows sending an image-only comment (no text)', async () => {
    const upload = vi.fn().mockResolvedValue({ id: 'at1' })
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    render(
      <Composer
        mode="reply"
        identity={identity}
        onNeedIdentity={(r) => r(identity)}
        onSubmit={onSubmit}
        upload={upload as never}
      />,
    )
    // No text typed — just an attachment.
    const file = new File(['x'], 'shot.png', { type: 'image/png' })
    fireEvent.change(screen.getByTestId('composer-file'), { target: { files: [file] } })
    await waitFor(() => expect(screen.getByRole('button', { name: /send/i })).toBeEnabled())
    fireEvent.click(screen.getByRole('button', { name: /send/i }))
    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({ text: '', attachmentIds: ['at1'], who: identity }),
    )
  })

  it('removing a pending attachment re-enables Send (text present)', async () => {
    const upload = vi.fn().mockResolvedValue({ id: 'at1' })
    render(
      <Composer
        mode="reply"
        identity={identity}
        onNeedIdentity={(r) => r(identity)}
        onSubmit={vi.fn().mockResolvedValue(undefined)}
        upload={upload as never}
      />,
    )
    fireEvent.change(screen.getByPlaceholderText(/reply/i), { target: { value: 'hi' } })
    const file = new File(['x'], 'shot.png', { type: 'image/png' })
    fireEvent.change(screen.getByTestId('composer-file'), { target: { files: [file] } })
    await waitFor(() => expect(screen.getByRole('button', { name: /send/i })).toBeEnabled())
    fireEvent.click(screen.getByRole('button', { name: /remove attachment/i }))
    expect(screen.getByRole('button', { name: /send/i })).toBeEnabled()
  })
})
