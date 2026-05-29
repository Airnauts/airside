// packages/client/src/ui/ThreadPopover.test.tsx
import type { ThreadListItem } from '@comments/core'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ThreadsProvider } from '../threads/ThreadsProvider'
import { useController } from '../threads/useThreads'
import { ThreadPopover } from './ThreadPopover'

const item = (over: Partial<ThreadListItem> = {}) =>
  ({
    id: 'a',
    status: 'open',
    anchorState: 'anchored',
    unresolvedCount: 1,
    commentCount: 1,
    createdBy: { email: 'a@b.c', name: 'Ann' },
    ...over,
  }) as unknown as ThreadListItem

function Harness({ client }: { client: never }) {
  const controller = useController()
  return (
    <>
      <button type="button" onClick={() => controller.openThread('a')}>
        open-a
      </button>
      <ThreadPopover
        item={item()}
        pin={{ x: 10, y: 10 }}
        client={client}
        identity={{ email: 'a@b.c', name: 'Ann' }}
        onNeedIdentity={(r) => r({ email: 'a@b.c', name: 'Ann' })}
      />
    </>
  )
}

function client(over: Record<string, unknown> = {}) {
  return {
    getThread: vi.fn().mockResolvedValue({
      id: 'a',
      status: 'open',
      comments: [
        {
          id: 'c1',
          author: { email: 'a@b.c', name: 'Ann' },
          text: 'first',
          attachments: [],
          createdAt: new Date().toISOString(),
        },
      ],
    }),
    addComment: vi.fn().mockResolvedValue({
      id: 'c2',
      author: { email: 'a@b.c' },
      text: 'reply',
      attachments: [],
      createdAt: new Date().toISOString(),
    }),
    setThreadStatus: vi.fn().mockResolvedValue({ id: 'a', status: 'resolved' }),
    upload: vi.fn(),
    ...over,
  } as never
}

describe('ThreadPopover', () => {
  it('opens on controller.openThread, loads detail, and shows comments', async () => {
    const c = client()
    render(
      <ThreadsProvider client={c}>
        <Harness client={c} />
      </ThreadsProvider>,
    )
    fireEvent.click(screen.getByText('open-a'))
    await waitFor(() => expect(screen.getByText('first')).toBeInTheDocument())
  })

  it('posts a reply via addComment (optimistic)', async () => {
    const c = client()
    render(
      <ThreadsProvider client={c}>
        <Harness client={c} />
      </ThreadsProvider>,
    )
    fireEvent.click(screen.getByText('open-a'))
    await waitFor(() => expect(screen.getByText('first')).toBeInTheDocument())
    fireEvent.change(screen.getByPlaceholderText(/reply/i), { target: { value: 'looks good' } })
    fireEvent.click(screen.getByRole('button', { name: /send/i }))
    await waitFor(() =>
      expect(
        (c as never as { addComment: ReturnType<typeof vi.fn> }).addComment,
      ).toHaveBeenCalled(),
    )
  })

  it('resolves via setThreadStatus', async () => {
    const c = client()
    render(
      <ThreadsProvider client={c}>
        <Harness client={c} />
      </ThreadsProvider>,
    )
    fireEvent.click(screen.getByText('open-a'))
    await waitFor(() => expect(screen.getByText('first')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /✓ Resolve/ }))
    await waitFor(() =>
      expect(
        (c as never as { setThreadStatus: ReturnType<typeof vi.fn> }).setThreadStatus,
      ).toHaveBeenCalledWith('a', { status: 'resolved' }),
    )
  })
})
