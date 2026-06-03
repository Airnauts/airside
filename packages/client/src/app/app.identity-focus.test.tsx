import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mockRect } from '../../test/test-helpers/dom'
import type { ApiClient } from '../api/client'
import { WidgetApp } from './app'

// A thread anchored to #t so the runtime places it and the pin/popover render.
function clientWithOneThread(): ApiClient {
  return {
    listThreads: vi.fn(async () => ({
      threads: [
        {
          id: 'th1',
          status: 'open',
          anchorState: 'anchored',
          unresolvedCount: 1,
          commentCount: 1,
          createdBy: { email: 'ann@example.com', name: 'Ann' },
          anchor: {
            schemaVersion: 1,
            selectors: ['#t', '#t'],
            signals: {
              tag: 'p',
              classes: ['lead'],
              siblingIndex: 0,
              ancestorTrail: ['main'],
              textSnippet: 'reply target text',
            },
            offset: { fx: 0.5, fy: 0.5 },
          },
        },
      ],
      nextCursor: null,
    })),
    getThread: vi.fn(async () => ({
      id: 'th1',
      status: 'open',
      comments: [
        {
          id: 'c1',
          author: { email: 'ann@example.com', name: 'Ann' },
          text: 'the first comment',
          attachments: [],
          createdAt: new Date().toISOString(),
        },
      ],
    })),
    addComment: vi.fn(async () => ({
      id: 'c2',
      author: { email: 'rev@example.com' },
      text: 'my reply',
      attachments: [],
      createdAt: new Date().toISOString(),
    })),
    createThread: vi.fn(),
    setThreadStatus: vi.fn(),
    refreshAnchor: vi.fn(),
    upload: vi.fn(),
  } as unknown as ApiClient
}

describe('identity modal keeps the thread popover open', () => {
  beforeEach(() => localStorage.clear())

  it('replying without a stored identity keeps the thread open after the modal submits', async () => {
    document.body.innerHTML = '<main><p id="t" class="lead">reply target text</p></main>'
    mockRect(document.querySelector('#t') as Element, { left: 0, top: 0, width: 100, height: 20 })
    const client = clientWithOneThread()
    render(<WidgetApp options={{ key: 'k', endpoint: 'http://x' }} client={client} />)

    // Open the existing thread.
    const pin = await screen.findByTestId('comments-pin')
    fireEvent.click(pin)
    await waitFor(() => expect(screen.getByText('the first comment')).toBeInTheDocument())
    expect(screen.getByRole('button', { name: /✓ Resolve/ })).toBeInTheDocument()

    // Reply with no identity → Send opens the identity modal.
    fireEvent.change(screen.getByPlaceholderText(/reply…/i), { target: { value: 'my reply' } })
    fireEvent.click(screen.getByRole('button', { name: /send/i }))
    fireEvent.change(await screen.findByLabelText('Email'), {
      target: { value: 'rev@example.com' },
    })
    fireEvent.click(screen.getByRole('button', { name: /start commenting/i }))

    // The reply posts...
    await waitFor(() => expect(client.addComment).toHaveBeenCalled())
    // ...and the thread popover must STILL be open (the pin must not lose focus / close).
    await waitFor(() => expect(screen.getByText('my reply')).toBeInTheDocument())
    expect(screen.getByRole('button', { name: /✓ Resolve/ })).toBeInTheDocument()
  })

  it('placing a first comment without identity opens the new thread after the modal submits', async () => {
    document.body.innerHTML = '<main><p id="t" class="lead">new thread target text</p></main>'
    mockRect(document.querySelector('#t') as Element, { left: 0, top: 0, width: 100, height: 20 })

    const client = {
      // The created thread comes back as a full Thread with its first comment (production shape).
      createThread: vi.fn(async (body: { comment: { text: string } }) => ({
        id: 'new1',
        status: 'open',
        comments: [
          {
            id: 'c-first',
            author: { email: 'rev@example.com' },
            text: body.comment.text,
            attachments: [],
            createdAt: new Date().toISOString(),
          },
        ],
      })),
      getThread: vi.fn(),
      addComment: vi.fn(),
      setThreadStatus: vi.fn(),
      refreshAnchor: vi.fn(),
      upload: vi.fn(),
      // After create, runtime.refresh() re-lists and matches the new thread to #t so its
      // ThreadPopover mounts. Reuse the captured anchor so the runtime re-matches it.
      listThreads: vi.fn(async () => {
        const created = (client.createThread as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]
        if (!created) return { threads: [], nextCursor: null }
        return {
          threads: [
            {
              id: 'new1',
              status: 'open',
              anchorState: 'anchored',
              unresolvedCount: 1,
              commentCount: 1,
              createdBy: { email: 'rev@example.com' },
              anchor: created.anchor,
            },
          ],
          nextCursor: null,
        }
      }),
    } as unknown as ApiClient

    render(<WidgetApp options={{ key: 'k', endpoint: 'http://x' }} client={client} />)

    fireEvent.click(screen.getByTestId('comments-place'))
    fireEvent.click(document.querySelector('#t') as Element, { clientX: 50, clientY: 10 })
    fireEvent.change(await screen.findByPlaceholderText(/add a comment/i), {
      target: { value: 'my note' },
    })
    // Send with no identity → the modal opens; the draft must not collapse behind it.
    fireEvent.click(screen.getByRole('button', { name: /send/i }))
    expect(screen.getByTestId('comments-draft')).toBeInTheDocument()

    fireEvent.change(await screen.findByLabelText('Email'), {
      target: { value: 'rev@example.com' },
    })
    fireEvent.click(screen.getByRole('button', { name: /start commenting/i }))

    await waitFor(() => expect(client.createThread).toHaveBeenCalled())
    // The new thread ends OPEN (its first comment is shown), not a closed pin.
    await waitFor(() => expect(screen.getByText('my note')).toBeInTheDocument())
    expect(screen.getByRole('button', { name: /✓ Resolve/ })).toBeInTheDocument()
    // The draft popover has been replaced by the real thread (not lingering).
    expect(screen.queryByTestId('comments-draft')).not.toBeInTheDocument()
  })
})
