import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { WidgetProvider } from '../app/providers'
import { ThreadsProvider } from '../threads/ThreadsProvider'
import { ToastProvider } from './toast'
import { useController } from '../threads/useThreads'
import { DetachedThread } from './DetachedThread'

function Probe() {
  const c = useController()
  return <button type="button" onClick={() => c.openThread('a')}>open</button>
}

function setup() {
  const client = {
    getThread: vi.fn().mockResolvedValue({
      id: 'a', status: 'open',
      createdBy: { email: 'a@b.c', name: 'Ann' }, unresolvedCount: 1,
      comments: [{ id: 'c1', author: { email: 'a@b.c', name: 'Ann' }, text: 'Button moved', attachments: [], createdAt: new Date().toISOString() }],
    }),
    addComment: vi.fn(), setThreadStatus: vi.fn(), upload: vi.fn(),
  }
  render(
    <WidgetProvider>
      <ToastProvider>
        <ThreadsProvider client={client as never}>
          <Probe />
          <DetachedThread client={client as never} identity={null} onNeedIdentity={() => {}} />
        </ThreadsProvider>
      </ToastProvider>
    </WidgetProvider>,
  )
  return { client }
}

describe('DetachedThread', () => {
  it('renders nothing when no thread is open', () => {
    setup()
    expect(screen.queryByTestId('comments-detached')).not.toBeInTheDocument()
  })

  it('renders the card for an open thread that has no pin placement, with the anchor-lost banner', async () => {
    setup()
    screen.getByText('open').click()
    await waitFor(() => expect(screen.getByTestId('comments-detached')).toBeInTheDocument())
    expect(screen.getByText('Button moved')).toBeInTheDocument()
    expect(screen.getByText(/anchor was lost/i)).toBeInTheDocument()
  })

  it('closes via the card close button', async () => {
    setup()
    screen.getByText('open').click()
    await waitFor(() => screen.getByTestId('comments-detached'))
    screen.getByRole('button', { name: /close/i }).click()
    await waitFor(() => expect(screen.queryByTestId('comments-detached')).not.toBeInTheDocument())
  })
})
