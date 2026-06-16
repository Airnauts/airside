import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ApiClient } from '../api/client'
import { WidgetApp } from './app'

function mockClient(): ApiClient {
  return {
    listThreads: vi.fn(async () => ({ threads: [], nextCursor: null })),
    createThread: vi.fn(
      async () => ({ id: 'real-1' }) as Awaited<ReturnType<ApiClient['createThread']>>,
    ),
    getThread: vi.fn(),
    addComment: vi.fn(),
    setThreadStatus: vi.fn(),
    refreshAnchor: vi.fn(),
    upload: vi.fn(),
  } as ApiClient
}

// Logged-in state: seed identity so WidgetApp renders the full commenting UI (past the gate).
function login() {
  localStorage.setItem('airside:identity', JSON.stringify({ email: 'known@example.com' }))
}

function clickTarget() {
  const target = document.createElement('p')
  target.id = 'place-target'
  document.body.appendChild(target)
  target.getBoundingClientRect = () =>
    ({
      left: 0,
      top: 0,
      width: 100,
      height: 20,
      x: 0,
      y: 0,
      right: 100,
      bottom: 20,
      toJSON: () => ({}),
    }) as DOMRect
  return target
}

describe('WidgetApp', () => {
  beforeEach(() => localStorage.clear())

  it('creates a comment for a logged-in user without prompting again', async () => {
    login()
    const client = mockClient()
    render(<WidgetApp options={{ key: 'k', endpoint: 'http://x' }} client={client} />)
    const target = clickTarget()

    fireEvent.click(screen.getByTestId('comments-place'))
    fireEvent.click(target, { clientX: 50, clientY: 10 })
    fireEvent.change(await screen.findByPlaceholderText(/add a comment/i), {
      target: { value: 'Looks good' },
    })
    fireEvent.click(screen.getByRole('button', { name: /send/i }))

    await waitFor(() => expect(client.createThread).toHaveBeenCalledOnce())
    expect(client.createThread).toHaveBeenCalledWith(
      expect.objectContaining({
        author: expect.objectContaining({ email: 'known@example.com' }),
        comment: expect.objectContaining({ text: 'Looks good' }),
      }),
    )
    // No identity prompt — the user is already logged in.
    expect(screen.queryByLabelText('Email')).not.toBeInTheDocument()
    target.remove()
  })

  it('re-lists threads when the SPA route changes the pageKey', async () => {
    login()
    const client = mockClient()
    render(<WidgetApp options={{ key: 'k', endpoint: 'https://api.test' }} client={client} />)
    await waitFor(() => expect(client.listThreads).toHaveBeenCalledTimes(1))
    history.pushState({}, '', '/another-path')
    window.dispatchEvent(new PopStateEvent('popstate'))
    await waitFor(() => expect(client.listThreads.mock.calls.length).toBeGreaterThanOrEqual(2))
  })

  it('renders the launcher with accessible controls when logged in', async () => {
    login()
    const client = mockClient()
    render(<WidgetApp options={{ key: 'k', endpoint: 'http://x' }} client={client} />)
    expect(await screen.findByTestId('comments-place')).toBeInTheDocument()
    expect(screen.getByTestId('comments-panel-open')).toBeInTheDocument()
  })

  it('renders the Launcher panel button when logged in', () => {
    login()
    render(<WidgetApp options={{ key: 'k', endpoint: 'https://api.test' }} client={mockClient()} />)
    expect(screen.getByTestId('comments-panel-open')).toBeInTheDocument()
  })
})
