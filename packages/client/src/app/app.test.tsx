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

function clickTarget() {
  // Provide a target element to click after entering place mode.
  const target = document.createElement('p')
  target.id = 'place-target'
  document.body.appendChild(target)
  target.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: 100, height: 20, x: 0, y: 0, right: 100, bottom: 20, toJSON: () => ({}) }) as DOMRect
  return target
}

describe('WidgetApp', () => {
  beforeEach(() => localStorage.clear())

  it('prompts for identity on first placement, then creates after submit', async () => {
    const client = mockClient()
    render(<WidgetApp options={{ key: 'k', endpoint: 'http://x' }} client={client} />)
    const target = clickTarget()

    fireEvent.click(screen.getByRole('button', { name: /comment/i }))
    // Now in place mode — click the target element to trigger onNeedIdentity.
    fireEvent.click(target, { clientX: 50, clientY: 10 })
    // Identity modal appears (no identity yet).
    fireEvent.change(await screen.findByLabelText('Email'), { target: { value: 'rev@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: /start commenting/i }))

    await waitFor(() => expect(client.createThread).toHaveBeenCalledOnce())
    expect(client.createThread).toHaveBeenCalledWith(
      expect.objectContaining({ author: expect.objectContaining({ email: 'rev@example.com' }) }),
    )
    // Identity persisted for next time.
    expect(localStorage.getItem('comments:identity')).toContain('rev@example.com')
    target.remove()
  })

  it('skips the modal when identity is already stored', async () => {
    localStorage.setItem('comments:identity', JSON.stringify({ email: 'known@example.com' }))
    const client = mockClient()
    render(<WidgetApp options={{ key: 'k', endpoint: 'http://x' }} client={client} />)
    const target = clickTarget()

    fireEvent.click(screen.getByRole('button', { name: /comment/i }))
    // No identity modal — directly in place mode, click the target.
    fireEvent.click(target, { clientX: 50, clientY: 10 })

    await waitFor(() => expect(client.createThread).toHaveBeenCalledOnce())
    expect(client.createThread).toHaveBeenCalledWith(
      expect.objectContaining({ author: expect.objectContaining({ email: 'known@example.com' }) }),
    )
    expect(screen.queryByLabelText('Email')).not.toBeInTheDocument()
    target.remove()
  })
})
