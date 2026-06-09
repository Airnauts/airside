// packages/client/src/ui/ThreadPopover.test.tsx
import type { ThreadListItem } from '@airnauts/comments-core'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { WidgetProvider } from '../app/providers'
import { DraftsProvider } from '../drafts/DraftsProvider'
import type { PlacedThread } from '../threads/state'
import { ThreadsProvider } from '../threads/ThreadsProvider'
import { useController, useDispatch, useVisiblePlacements } from '../threads/useThreads'
import { ThreadPopover } from './ThreadPopover'
import { ToastProvider } from './toast'

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
    <DraftsProvider>
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
    </DraftsProvider>
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
    runThreadAction: vi.fn().mockResolvedValue({ id: 'a', status: 'open', comments: [] }),
    upload: vi.fn(),
    ...over,
  } as never
}

function clientResolved(over: Record<string, unknown> = {}) {
  return client({
    getThread: vi.fn().mockResolvedValue({
      id: 'a',
      status: 'resolved',
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
    setThreadStatus: vi.fn().mockResolvedValue({ id: 'a', status: 'open' }),
    ...over,
  })
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

  it('closes the popover via the ✕ close button (clears openId)', async () => {
    const c = client()
    render(
      <ThreadsProvider client={c}>
        <Harness client={c} />
      </ThreadsProvider>,
    )
    fireEvent.click(screen.getByText('open-a'))
    await waitFor(() => expect(screen.getByText('first')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /close/i }))
    await waitFor(() => expect(screen.queryByText('first')).not.toBeInTheDocument())
  })

  it('opens the popover when the pin itself is clicked', async () => {
    const c = client()
    render(
      <ThreadsProvider client={c}>
        <Harness client={c} />
      </ThreadsProvider>,
    )
    fireEvent.click(screen.getByTestId('comments-pin'))
    await waitFor(() => expect(screen.getByText('first')).toBeInTheDocument())
    expect((c as never as { getThread: ReturnType<typeof vi.fn> }).getThread).toHaveBeenCalledWith(
      'a',
    )
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

  it('shows the reply after posting', async () => {
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
    await waitFor(() => expect(screen.getByText('looks good')).toBeInTheDocument())
  })

  it('removes the optimistic reply when addComment fails', async () => {
    const addComment = vi.fn().mockRejectedValue(new Error('nope'))
    const c = client({ addComment })
    render(
      <ThreadsProvider client={c}>
        <Harness client={c} />
      </ThreadsProvider>,
    )
    fireEvent.click(screen.getByText('open-a'))
    await waitFor(() => expect(screen.getByText('first')).toBeInTheDocument())
    fireEvent.change(screen.getByPlaceholderText(/reply/i), { target: { value: 'oops' } })
    fireEvent.click(screen.getByRole('button', { name: /send/i }))
    await waitFor(() => expect(addComment).toHaveBeenCalled())
    await waitFor(() => expect(screen.queryByText('oops')).not.toBeInTheDocument())
  })

  it('replying to a resolved thread reopens it', async () => {
    const c = clientResolved()
    render(
      <ThreadsProvider client={c}>
        <Harness client={c} />
      </ThreadsProvider>,
    )
    fireEvent.click(screen.getByText('open-a'))
    await waitFor(() => expect(screen.getByText('first')).toBeInTheDocument())
    fireEvent.change(screen.getByPlaceholderText(/reply/i), { target: { value: 'reopen please' } })
    fireEvent.click(screen.getByRole('button', { name: /send/i }))
    await waitFor(() =>
      expect(
        (c as never as { setThreadStatus: ReturnType<typeof vi.fn> }).setThreadStatus,
      ).toHaveBeenCalledWith('a', { status: 'open' }),
    )
  })

  it('persists the reopen only after the reply is saved (no race with addComment)', async () => {
    // Hold addComment open so we can observe ordering: the reopen must not be persisted while
    // the reply is still in flight (the previous code fired both in parallel).
    let resolveAdd: (v: unknown) => void = () => {}
    const addComment = vi.fn().mockReturnValue(
      new Promise((res) => {
        resolveAdd = res
      }),
    )
    const setThreadStatus = vi.fn().mockResolvedValue({ id: 'a', status: 'open' })
    const c = clientResolved({ addComment, setThreadStatus })
    render(
      <ThreadsProvider client={c}>
        <Harness client={c} />
      </ThreadsProvider>,
    )
    fireEvent.click(screen.getByText('open-a'))
    await waitFor(() => expect(screen.getByText('first')).toBeInTheDocument())
    fireEvent.change(screen.getByPlaceholderText(/reply/i), { target: { value: 'reopen please' } })
    fireEvent.click(screen.getByRole('button', { name: /send/i }))
    await waitFor(() => expect(addComment).toHaveBeenCalled())
    // Reply in flight → reopen NOT yet persisted (no racing setThreadStatus).
    expect(setThreadStatus).not.toHaveBeenCalled()
    // Reply lands → reopen persists.
    resolveAdd({
      id: 'c2',
      author: { email: 'a@b.c' },
      text: 'reopen please',
      attachments: [],
      createdAt: new Date().toISOString(),
    })
    await waitFor(() => expect(setThreadStatus).toHaveBeenCalledWith('a', { status: 'open' }))
  })

  it('does not persist a reopen when the reply itself fails', async () => {
    const addComment = vi.fn().mockRejectedValue(new Error('nope'))
    const setThreadStatus = vi.fn().mockResolvedValue({ id: 'a', status: 'open' })
    const c = clientResolved({ addComment, setThreadStatus })
    render(
      <ThreadsProvider client={c}>
        <Harness client={c} />
      </ThreadsProvider>,
    )
    fireEvent.click(screen.getByText('open-a'))
    await waitFor(() => expect(screen.getByText('first')).toBeInTheDocument())
    fireEvent.change(screen.getByPlaceholderText(/reply/i), { target: { value: 'oops' } })
    fireEvent.click(screen.getByRole('button', { name: /send/i }))
    await waitFor(() => expect(addComment).toHaveBeenCalled())
    await waitFor(() => expect(screen.queryByText('oops')).not.toBeInTheDocument())
    // The failed reply must not leave a reopen persisted server-side, and the header stays Resolved.
    expect(setThreadStatus).not.toHaveBeenCalled()
    expect(screen.getByText(/✓ Resolved/)).toBeInTheDocument()
  })

  it('tells the user (and reverts the pin) when the reply posts but reopening fails', async () => {
    const setThreadStatus = vi.fn().mockRejectedValue(new Error('nope'))
    const c = clientResolved({ setThreadStatus })
    // Real toast stack so the partial-failure message actually renders into the DOM.
    render(
      <WidgetProvider>
        <ToastProvider>
          <ThreadsProvider client={c}>
            <Harness client={c} />
          </ThreadsProvider>
        </ToastProvider>
      </WidgetProvider>,
    )
    fireEvent.click(screen.getByText('open-a'))
    await waitFor(() => expect(screen.getByText('first')).toBeInTheDocument())
    fireEvent.change(screen.getByPlaceholderText(/reply/i), { target: { value: 'reopen please' } })
    fireEvent.click(screen.getByRole('button', { name: /send/i }))
    // Reply lands...
    await waitFor(() => expect(screen.getByText('reopen please')).toBeInTheDocument())
    // ...but the reopen fails: the user is told, and the header reverts to Resolved.
    await waitFor(() =>
      expect(screen.getByText(/reopening the thread failed/i)).toBeInTheDocument(),
    )
    await waitFor(() => expect(screen.getByText(/✓ Resolved/)).toBeInTheDocument())
  })

  it('rolls back status when resolve fails', async () => {
    const setThreadStatus = vi.fn().mockRejectedValue(new Error('nope'))
    const c = client({ setThreadStatus })
    render(
      <ThreadsProvider client={c}>
        <Harness client={c} />
      </ThreadsProvider>,
    )
    fireEvent.click(screen.getByText('open-a'))
    await waitFor(() => expect(screen.getByText('first')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /✓ Resolve/ }))
    await waitFor(() => expect(setThreadStatus).toHaveBeenCalled())
    await waitFor(() => expect(screen.getByText(/Open ·/)).toBeInTheDocument())
  })

  // Renders pins through useVisiblePlacements + INGEST_PLACEMENTS (like the real PinLayer),
  // so the visiblePlacements open-exemption is actually exercised. showResolved stays false.
  function PinsHarness({ client: c }: { client: never }) {
    const controller = useController()
    const dispatch = useDispatch()
    const placements = useVisiblePlacements()
    const placed: PlacedThread = {
      item: item(),
      pin: { x: 10, y: 10 },
      highlight: [],
    }
    return (
      <DraftsProvider>
        <button
          type="button"
          onClick={() => dispatch({ type: 'INGEST_PLACEMENTS', placements: [placed] })}
        >
          ingest
        </button>
        <button type="button" onClick={() => controller.openThread('a')}>
          open-a
        </button>
        {placements.map((p) => (
          <ThreadPopover
            key={p.item.id}
            item={p.item}
            pin={p.pin}
            client={c}
            identity={{ email: 'a@b.c', name: 'Ann' }}
            onNeedIdentity={(r) => r({ email: 'a@b.c', name: 'Ann' })}
          />
        ))}
      </DraftsProvider>
    )
  }

  it('flips the pin to ✓ and keeps the popover open immediately on resolve, no re-ingest (BUG B)', async () => {
    const c = client()
    render(
      <ThreadsProvider client={c}>
        <PinsHarness client={c} />
      </ThreadsProvider>,
    )
    // Ingest one OPEN placement, then open it. showResolved is the default (false).
    fireEvent.click(screen.getByText('ingest'))
    fireEvent.click(screen.getByText('open-a'))
    await waitFor(() => expect(screen.getByText('first')).toBeInTheDocument())
    // Pin starts unresolved.
    expect(screen.getByTestId('comments-pin')).toHaveAccessibleName(/^Comment thread by/i)
    // Resolve from the popover.
    fireEvent.click(screen.getByRole('button', { name: /✓ Resolve/ }))
    // WITHOUT any refresh/re-ingest: the pin is still rendered (open-exemption) and shows ✓...
    await waitFor(() =>
      expect(screen.getByTestId('comments-pin')).toHaveAccessibleName(/resolved/i),
    )
    expect(screen.getByTestId('comments-pin')).toHaveTextContent('✓')
    // ...and the popover stays open with a Resolved header.
    expect(screen.getByText(/✓ Resolved/)).toBeInTheDocument()
  })

  it('renders a thread-toolbar action, runs it, and shows the resulting external link', async () => {
    const runThreadAction = vi.fn().mockResolvedValue({
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
      actions: [],
      externalLinks: [
        {
          provider: 'jira',
          externalId: '10042',
          key: 'WEB-123',
          label: 'Jira WEB-123',
          url: 'https://co.atlassian.net/browse/WEB-123',
          createdAt: new Date().toISOString(),
        },
      ],
    })
    const c = client({
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
        externalLinks: [],
        actions: [
          {
            id: 'jira.createIssue',
            provider: 'jira',
            label: 'Create Jira issue',
            slot: 'thread-toolbar',
            presentation: { style: 'primary' },
          },
        ],
      }),
      runThreadAction,
    })
    render(
      <ThreadsProvider client={c}>
        <Harness client={c} />
      </ThreadsProvider>,
    )
    fireEvent.click(screen.getByText('open-a'))
    // The toolbar action surfaces once the thread loads.
    const runBtn = await screen.findByRole('button', { name: /create jira issue/i })
    fireEvent.click(runBtn)
    await waitFor(() => expect(runThreadAction).toHaveBeenCalledWith('a', 'jira.createIssue'))
    // After the action resolves: the button is gone (actions: []) and the new external link shows.
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: /create jira issue/i })).not.toBeInTheDocument(),
    )
    const link = await screen.findByRole('link', { name: /jira web-123/i })
    expect(link).toHaveAttribute('href', 'https://co.atlassian.net/browse/WEB-123')
  })
})
