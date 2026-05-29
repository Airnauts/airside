// packages/client/src/threads/ThreadsProvider.test.tsx
import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ThreadsProvider } from './ThreadsProvider'
import { useController, useOpenThread } from './useThreads'

function Probe() {
  const controller = useController()
  const { openId, detail, loading } = useOpenThread()
  return (
    <div>
      <button type="button" onClick={() => controller.openThread('a')}>
        open
      </button>
      <span data-testid="openId">{openId ?? 'none'}</span>
      <span data-testid="loading">{loading ? 'yes' : 'no'}</span>
      <span data-testid="detail">{detail ? detail.id : 'none'}</span>
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
})
