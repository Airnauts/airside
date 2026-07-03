// packages/client/src/ui/Composer.test.tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactElement } from 'react'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { WidgetProvider } from '../app/providers'
import { IdentityProvider } from '../identity/IdentityProvider'
import type { Identity } from '../identity/storage'
import { Composer } from './Composer'
import { ToastProvider } from './toast'

const identity = { email: 'a@b.c', name: 'Ann' }

function renderWithIdentity(
  ui: ReactElement,
  {
    identity: who = identity,
    requestIdentity = (r) => r(identity),
  }: {
    identity?: Identity | null
    requestIdentity?: (resume: (who: Identity) => void) => void
  } = {},
) {
  return render(
    <IdentityProvider identity={who} requestIdentity={requestIdentity}>
      {ui}
    </IdentityProvider>,
  )
}

// Toasts render into the WidgetProvider's container, so wrap with it (plus ToastProvider) when
// a test needs to assert the wrong-type / too-large affordance text.
function renderWithToast(ui: ReactElement) {
  return render(
    <WidgetProvider>
      <ToastProvider>
        <IdentityProvider identity={identity} requestIdentity={(r) => r(identity)}>
          {ui}
        </IdentityProvider>
      </ToastProvider>
    </WidgetProvider>,
  )
}

const pngFile = (name = 'shot.png') => new File(['x'], name, { type: 'image/png' })
const filesDrop = (files: File[]) => ({ dataTransfer: { types: ['Files'], files } })

// jsdom doesn't implement object URLs; stub them so the preview lifecycle runs.
beforeAll(() => {
  URL.createObjectURL = vi.fn(() => 'blob:preview') as never
  URL.revokeObjectURL = vi.fn() as never
})

describe('Composer', () => {
  it('lets the text input shrink (min-w-0) so the row fits the fixed-width popover', () => {
    renderWithIdentity(<Composer mode="reply" onSubmit={vi.fn()} upload={vi.fn()} />)
    // Without min-w-0, flex items keep min-width:auto and the input cannot shrink below its
    // intrinsic width — pushing Send past the w-80 popover edge (clipped by overflow-hidden).
    const input = screen.getByPlaceholderText(/reply/i)
    expect(input.className).toContain('air:min-w-0')
    expect(input.className).toContain('air:flex-1')
  })

  it('disables Send when empty and enables it with text', () => {
    renderWithIdentity(<Composer mode="reply" onSubmit={vi.fn()} upload={vi.fn()} />)
    const send = screen.getByRole('button', { name: /send/i })
    expect(send).toBeDisabled()
    fireEvent.change(screen.getByPlaceholderText(/reply/i), { target: { value: 'hi' } })
    expect(send).toBeEnabled()
  })

  it('submits text + attachmentIds', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    renderWithIdentity(<Composer mode="reply" onSubmit={onSubmit} upload={vi.fn()} />)
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
    renderWithIdentity(<Composer mode="newThread" onSubmit={onSubmit} upload={vi.fn()} />, {
      identity: null,
      requestIdentity: onNeedIdentity,
    })
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
    renderWithIdentity(<Composer mode="reply" onSubmit={onSubmit} upload={upload as never} />)
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
    renderWithIdentity(<Composer mode="reply" onSubmit={vi.fn()} upload={upload as never} />)
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
    renderWithIdentity(
      <Composer
        mode="reply"
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
    renderWithIdentity(<Composer mode="reply" onSubmit={onSubmit} upload={upload as never} />)
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
    renderWithIdentity(
      <Composer
        mode="reply"
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

  it('is controlled over text when value/onValueChange are provided', () => {
    const onValueChange = vi.fn()
    renderWithIdentity(
      <Composer
        mode="reply"
        onSubmit={async () => {}}
        upload={async () => ({}) as never}
        value="seed"
        onValueChange={onValueChange}
      />,
      { identity: { email: 'a@b.c' }, requestIdentity: () => {} },
    )
    const input = screen.getByPlaceholderText(/reply/i) as HTMLInputElement
    expect(input.value).toBe('seed')
    fireEvent.change(input, { target: { value: 'seed!' } })
    expect(onValueChange).toHaveBeenCalledWith('seed!')
  })

  it('clears via onValueChange/onAttachmentChange after a successful send', async () => {
    const onValueChange = vi.fn()
    const onAttachmentChange = vi.fn()
    renderWithIdentity(
      <Composer
        mode="reply"
        onSubmit={async () => {}}
        upload={async () => ({}) as never}
        value="hello"
        onValueChange={onValueChange}
        attachment={null}
        onAttachmentChange={onAttachmentChange}
      />,
      { identity: { email: 'a@b.c' }, requestIdentity: () => {} },
    )
    fireEvent.click(screen.getByRole('button', { name: /send/i }))
    await waitFor(() => expect(onValueChange).toHaveBeenLastCalledWith(''))
    expect(onAttachmentChange).toHaveBeenLastCalledWith(null)
  })

  it('uploads a dropped image and gates Send until the upload resolves', async () => {
    let resolveUpload: (a: { id: string }) => void = () => {}
    const upload = vi.fn(
      () =>
        new Promise((res) => {
          resolveUpload = res as never
        }),
    )
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    renderWithIdentity(<Composer mode="reply" onSubmit={onSubmit} upload={upload as never} />)
    const composer = screen.getByPlaceholderText(/reply/i).closest('div')?.parentElement as Element
    fireEvent.drop(composer, filesDrop([pngFile()]))
    expect(await screen.findByAltText('shot.png')).toHaveAttribute('src', 'blob:preview')
    expect(upload).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: /send/i })).toBeDisabled() // upload in flight
    resolveUpload({ id: 'at1' })
    await waitFor(() => expect(screen.getByRole('button', { name: /send/i })).toBeEnabled())
    fireEvent.click(screen.getByRole('button', { name: /send/i }))
    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({ text: '', attachmentIds: ['at1'], who: identity }),
    )
  })

  it('replaces the current attachment when a second image is dropped (single-image)', async () => {
    const upload = vi.fn().mockResolvedValue({ id: 'at1' })
    renderWithIdentity(<Composer mode="reply" onSubmit={vi.fn()} upload={upload as never} />)
    const composer = screen.getByPlaceholderText(/reply/i).closest('div')?.parentElement as Element
    fireEvent.drop(composer, filesDrop([pngFile('first.png')]))
    await screen.findByAltText('first.png')
    ;(URL.revokeObjectURL as ReturnType<typeof vi.fn>).mockClear()
    fireEvent.drop(composer, filesDrop([pngFile('second.png')]))
    await screen.findByAltText('second.png')
    expect(screen.queryByAltText('first.png')).not.toBeInTheDocument()
    expect(upload).toHaveBeenCalledTimes(2)
    expect(URL.revokeObjectURL).toHaveBeenCalled() // prior preview URL released
  })

  it('toasts and does not upload when a non-image file is dropped', async () => {
    const upload = vi.fn()
    renderWithToast(<Composer mode="reply" onSubmit={vi.fn()} upload={upload as never} />)
    const composer = screen.getByPlaceholderText(/reply/i).closest('div')?.parentElement as Element
    const pdf = new File(['x'], 'doc.pdf', { type: 'application/pdf' })
    fireEvent.drop(composer, filesDrop([pdf]))
    expect(await screen.findByText(/unsupported image type/i)).toBeInTheDocument()
    expect(upload).not.toHaveBeenCalled()
  })

  it('toasts and does not upload when an oversize image is dropped', async () => {
    const upload = vi.fn()
    renderWithToast(<Composer mode="reply" onSubmit={vi.fn()} upload={upload as never} />)
    const composer = screen.getByPlaceholderText(/reply/i).closest('div')?.parentElement as Element
    const big = pngFile('huge.png')
    Object.defineProperty(big, 'size', { value: 5 * 1024 * 1024 + 1 })
    fireEvent.drop(composer, filesDrop([big]))
    expect(await screen.findByText(/too large/i)).toBeInTheDocument()
    expect(upload).not.toHaveBeenCalled()
  })

  it('uploads only the first image when several files are dropped', async () => {
    const upload = vi.fn().mockResolvedValue({ id: 'at1' })
    renderWithIdentity(<Composer mode="reply" onSubmit={vi.fn()} upload={upload as never} />)
    const composer = screen.getByPlaceholderText(/reply/i).closest('div')?.parentElement as Element
    fireEvent.drop(composer, filesDrop([pngFile('a.png'), pngFile('b.png')]))
    await screen.findByAltText('a.png')
    expect(upload).toHaveBeenCalledTimes(1)
    expect(screen.queryByAltText('b.png')).not.toBeInTheDocument()
  })

  it('uploads a pasted image with a synthesized pasted-*.png name', async () => {
    const upload = vi.fn().mockResolvedValue({ id: 'at1' })
    renderWithIdentity(<Composer mode="reply" onSubmit={vi.fn()} upload={upload as never} />)
    const composer = screen.getByPlaceholderText(/reply/i).closest('div')?.parentElement as Element
    const blob = pngFile('')
    fireEvent.paste(composer, {
      clipboardData: { items: [{ kind: 'file', type: 'image/png', getAsFile: () => blob }] },
    })
    await waitFor(() => expect(upload).toHaveBeenCalledTimes(1))
    const uploaded = upload.mock.calls[0][0] as File
    expect(uploaded.name).toMatch(/^pasted-\d+\.png$/)
    expect(uploaded.type).toBe('image/png')
  })

  it('ignores a plain-text paste (no upload, not prevented)', () => {
    const upload = vi.fn()
    renderWithIdentity(<Composer mode="reply" onSubmit={vi.fn()} upload={upload as never} />)
    const composer = screen.getByPlaceholderText(/reply/i).closest('div')?.parentElement as Element
    const notPrevented = fireEvent.paste(composer, {
      clipboardData: { items: [{ kind: 'string', type: 'text/plain', getAsFile: () => null }] },
    })
    expect(upload).not.toHaveBeenCalled()
    expect(notPrevented).toBe(true) // default not prevented — text still pastes into the input
  })

  it('shows the drop overlay while dragging and hides it after the matching leave', () => {
    renderWithIdentity(<Composer mode="reply" onSubmit={vi.fn()} upload={vi.fn()} />)
    const composer = screen.getByPlaceholderText(/reply/i).closest('div')?.parentElement as Element
    const carry = { dataTransfer: { types: ['Files'] } }
    fireEvent.dragEnter(composer, carry)
    expect(screen.getByTestId('composer-dropzone')).toBeInTheDocument()
    // Entering a child bumps the counter; the matching leave must NOT hide the overlay (no flicker).
    fireEvent.dragEnter(composer, carry)
    fireEvent.dragLeave(composer)
    expect(screen.getByTestId('composer-dropzone')).toBeInTheDocument()
    fireEvent.dragLeave(composer)
    expect(screen.queryByTestId('composer-dropzone')).not.toBeInTheDocument()
  })
})
