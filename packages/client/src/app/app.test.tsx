import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ApiClient } from '../api/client'
import { WidgetApp } from './app'

function mockClient(): ApiClient {
  return {
    listThreads: vi.fn(async () => ({ threads: [], nextCursor: null })),
    createThread: vi.fn(async () => ({ id: 'real-1' }) as Awaited<ReturnType<ApiClient['createThread']>>),
    getThread: vi.fn(),
    addComment: vi.fn(),
    setThreadStatus: vi.fn(),
    refreshAnchor: vi.fn(),
    upload: vi.fn(),
  } as ApiClient
}

describe('WidgetApp', () => {
  beforeEach(() => localStorage.clear())

  it('prompts for identity on first placement, then creates after submit', async () => {
    const client = mockClient()
    render(<WidgetApp options={{ key: 'k', endpoint: 'http://x' }} client={client} />)

    fireEvent.click(screen.getByRole('button', { name: /comment/i }))
    // Identity modal appears.
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'rev@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: /start commenting/i }))

    expect(await screen.findByTitle('real-1')).toBeInTheDocument()
    expect(client.createThread).toHaveBeenCalledOnce()
    // Identity persisted for next time.
    expect(localStorage.getItem('comments:identity')).toContain('rev@example.com')
  })

  it('skips the modal when identity is already stored', async () => {
    localStorage.setItem('comments:identity', JSON.stringify({ email: 'known@example.com' }))
    const client = mockClient()
    render(<WidgetApp options={{ key: 'k', endpoint: 'http://x' }} client={client} />)

    fireEvent.click(screen.getByRole('button', { name: /comment/i }))
    expect(await screen.findByTitle('real-1')).toBeInTheDocument()
    expect(screen.queryByLabelText('Email')).not.toBeInTheDocument()
  })
})
