// packages/client/src/ui/ThreadConversation.test.tsx
import type { Thread, ThreadListItem } from '@airnauts/comments-core'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { type ReactElement, useEffect } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { DraftsProvider, useDraft } from '../drafts/DraftsProvider'
import { IdentityProvider } from '../identity/IdentityProvider'
import { ThreadsProvider } from '../threads/ThreadsProvider'
import { useDispatch, useThreadsState } from '../threads/useThreads'
import { ThreadConversation } from './ThreadConversation'

const renderWithIdentity = (ui: ReactElement) =>
  render(
    <IdentityProvider identity={{ email: 'a@b.c' }} requestIdentity={() => {}}>
      {ui}
    </IdentityProvider>,
  )

const item = (over: Partial<ThreadListItem> = {}) =>
  ({
    id: 't1',
    status: 'open',
    anchorState: 'anchored',
    unresolvedCount: 1,
    commentCount: 1,
    createdBy: { email: 'a@b.c', name: 'Ann' },
    pageUrl: 'https://x/a',
    ...over,
  }) as unknown as ThreadListItem

const mockClient = {
  getThread: vi.fn().mockResolvedValue({ id: 't1', status: 'open', comments: [] }),
  addComment: vi.fn(),
  setThreadStatus: vi.fn(),
  upload: vi.fn(),
} as never

function Wired({ variant }: { variant: 'popover' | 'sidebar' }) {
  const d = useDraft('t1')
  return (
    <ThreadConversation
      item={item()}
      client={mockClient}
      variant={variant}
      draftText={d.draft.text}
      onDraftTextChange={d.setText}
      draftAttachment={d.draft.attachment}
      onDraftAttachmentChange={d.setAttachment}
    />
  )
}

function Seeder({ thread }: { thread: Thread }) {
  const dispatch = useDispatch()
  useEffect(() => {
    dispatch({ type: 'DETAIL_LOADED', id: thread.id, thread })
  }, [dispatch, thread])
  return null
}

describe('ThreadConversation detail source', () => {
  it('renders its own thread comments by item id, even when openId is null', async () => {
    // Regression: the sidebar detail read comments via openId (detailById[openId]). The pin
    // popover nulls openId on any outside interaction, so the sidebar showed an empty thread
    // even though the detail was cached under its own id. The conversation must read by item.id.
    const thread = {
      id: 't1',
      status: 'open',
      comments: [
        {
          id: 'c1',
          author: { email: 'a@b.c', name: 'Ann' },
          text: 'detail body text',
          attachments: [],
          createdAt: new Date().toISOString(),
        },
      ],
    } as unknown as Thread
    renderWithIdentity(
      <ThreadsProvider client={mockClient}>
        <DraftsProvider>
          {/* openId stays null — only the per-id detail cache is seeded. */}
          <Seeder thread={thread} />
          <ThreadConversation item={item()} client={mockClient} variant="sidebar" />
        </DraftsProvider>
      </ThreadsProvider>,
    )
    expect(await screen.findByText('detail body text')).toBeInTheDocument()
  })
})

describe('ThreadConversation header count', () => {
  it('counts from the live detail, not the (stale) list item, so new replies show up', async () => {
    // The list item carries the count from the last list fetch (commentCount: 1). After a reply the
    // detail has two comments but the list item is not refetched — the header must follow the detail.
    const thread = {
      id: 't1',
      status: 'open',
      comments: [
        { id: 'c1', author: { email: 'a@b.c' }, text: 'root', attachments: [], createdAt: 'x' },
        { id: 'c2', author: { email: 'a@b.c' }, text: 'reply', attachments: [], createdAt: 'y' },
      ],
    } as unknown as Thread
    renderWithIdentity(
      <ThreadsProvider client={mockClient}>
        <DraftsProvider>
          <Seeder thread={thread} />
          <ThreadConversation
            item={item({ commentCount: 1 })}
            client={mockClient}
            variant="sidebar"
          />
        </DraftsProvider>
      </ThreadsProvider>,
    )
    expect(await screen.findByText(/Open · 2 comments/)).toBeInTheDocument()
  })
})

describe('ThreadConversation reply count', () => {
  it('posting a reply bumps the list-item count (the pin badge) via the controller', async () => {
    const thread = {
      id: 't1',
      status: 'open',
      comments: [
        { id: 'c1', author: { email: 'a@b.c' }, text: 'root', attachments: [], createdAt: 'x' },
      ],
    } as unknown as Thread
    const client = {
      ...(mockClient as object),
      addComment: vi.fn().mockResolvedValue({
        id: 'c2',
        author: { email: 'a@b.c' },
        text: 'my reply',
        attachments: [],
        createdAt: 'y',
      }),
    } as never

    function Probe() {
      const state = useThreadsState()
      return <span data-testid="count">{state.itemsById.t1?.commentCount ?? '?'}</span>
    }
    function Seed() {
      const dispatch = useDispatch()
      useEffect(() => {
        dispatch({
          type: 'INGEST_PLACEMENTS',
          placements: [{ item: item({ commentCount: 1 }), pin: { x: 0, y: 0 }, highlight: [] }],
        })
        dispatch({ type: 'DETAIL_LOADED', id: 't1', thread })
      }, [dispatch])
      return null
    }

    renderWithIdentity(
      <ThreadsProvider client={client}>
        <DraftsProvider>
          <Seed />
          <Probe />
          <ThreadConversation item={item({ commentCount: 1 })} client={client} variant="sidebar" />
        </DraftsProvider>
      </ThreadsProvider>,
    )

    expect(screen.getByTestId('count')).toHaveTextContent('1')
    const input = await screen.findByPlaceholderText(/reply/i)
    fireEvent.change(input, { target: { value: 'my reply' } })
    fireEvent.click(screen.getByText('Send'))
    await waitFor(() => expect(screen.getByTestId('count')).toHaveTextContent('2'))
  })
})

describe('ThreadConversation reply focus', () => {
  it('focuses the reply input on mount in the sidebar (Reply/select/cross-page entry)', async () => {
    renderWithIdentity(
      <ThreadsProvider client={mockClient}>
        <DraftsProvider>
          <Wired variant="sidebar" />
        </DraftsProvider>
      </ThreadsProvider>,
    )
    const input = await screen.findByPlaceholderText(/reply/i)
    // Focus is deferred to the next animation frame (so it wins against the Radix Dialog's
    // focus scope), so wait for it. The authoritative real-browser check lives in the
    // sidebar-detail e2e (jsdom can't observe the Dialog focus interaction).
    await waitFor(() => expect(document.activeElement).toBe(input))
  })

  it('focuses the reply input on mount in the popover too (clicking a pin)', async () => {
    renderWithIdentity(
      <ThreadsProvider client={mockClient}>
        <DraftsProvider>
          <Wired variant="popover" />
        </DraftsProvider>
      </ThreadsProvider>,
    )
    const input = await screen.findByPlaceholderText(/reply/i)
    // Focus is deferred to the next frame (so it wins against Radix focus scopes).
    await waitFor(() => expect(document.activeElement).toBe(input))
  })
})

describe('ThreadConversation shared draft', () => {
  it('mirrors composer text between popover and sidebar for the same thread', () => {
    renderWithIdentity(
      <ThreadsProvider client={mockClient}>
        <DraftsProvider>
          <Wired variant="popover" />
          <Wired variant="sidebar" />
        </DraftsProvider>
      </ThreadsProvider>,
    )
    const inputs = screen.getAllByPlaceholderText(/reply/i) as HTMLInputElement[]
    expect(inputs).toHaveLength(2)
    fireEvent.change(inputs[0], { target: { value: 'shared text' } })
    expect(inputs[1].value).toBe('shared text')
  })
})
