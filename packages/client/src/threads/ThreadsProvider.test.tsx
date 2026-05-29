// packages/client/src/threads/ThreadsProvider.test.tsx
import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ThreadsProvider } from './ThreadsProvider'
import { useController, useOpenThread } from './useThreads'

function Probe() {
  const controller = useController()
  const { openId, detail, loading, error } = useOpenThread()
  return (
    <div>
      <button type="button" onClick={() => controller.openThread('a')}>
        open
      </button>
      <span data-testid="openId">{openId ?? 'none'}</span>
      <span data-testid="loading">{loading ? 'yes' : 'no'}</span>
      <span data-testid="detail">{detail ? detail.id : 'none'}</span>
      <span data-testid="error">{error ? 'yes' : 'no'}</span>
    </div>
  )
}

describe('ThreadsProvider + controller', () => {
  it('openThread sets openId and lazily fetches the thread detail', async () => {
    const getThread = vi.fn().mockResolvedValue({ id: 'a', status: 'open', comments: [] })
    render(
      <ThreadsProvider client={{ getThread } as never}>
        <Probe />
      </ThreadsProvider>,
    )
    screen.getByText('open').click()
    await waitFor(() => expect(screen.getByTestId('openId').textContent).toBe('a'))
    expect(getThread).toHaveBeenCalledWith('a')
    await waitFor(() => expect(screen.getByTestId('detail').textContent).toBe('a'))
    expect(screen.getByTestId('loading').textContent).toBe('no')
  })

  it('shows loading=yes before detail resolves, then no', async () => {
    const getThread = vi.fn().mockResolvedValue({ id: 'a', status: 'open', comments: [] })
    render(
      <ThreadsProvider client={{ getThread } as never}>
        <Probe />
      </ThreadsProvider>,
    )
    screen.getByText('open').click()
    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('yes'))
    await waitFor(() => expect(screen.getByTestId('detail').textContent).toBe('a'))
    expect(screen.getByTestId('loading').textContent).toBe('no')
  })

  it('does not re-fetch a thread whose detail is already cached', async () => {
    const getThread = vi.fn().mockResolvedValue({ id: 'a', status: 'open', comments: [] })
    render(
      <ThreadsProvider client={{ getThread } as never}>
        <Probe />
      </ThreadsProvider>,
    )
    screen.getByText('open').click()
    await waitFor(() => expect(screen.getByTestId('detail').textContent).toBe('a'))
    screen.getByText('open').click()
    await waitFor(() => expect(screen.getByTestId('openId').textContent).toBe('a'))
    expect(getThread).toHaveBeenCalledTimes(1)
  })

  it('sets error=yes when getThread rejects', async () => {
    const getThread = vi.fn().mockRejectedValue(new Error('network'))
    render(
      <ThreadsProvider client={{ getThread } as never}>
        <Probe />
      </ThreadsProvider>,
    )
    screen.getByText('open').click()
    await waitFor(() => expect(screen.getByTestId('error').textContent).toBe('yes'))
    expect(screen.getByTestId('loading').textContent).toBe('no')
  })
})
