// packages/client/src/ui/ThreadConversation.test.tsx
import type { Thread, ThreadListItem } from '@airnauts/comments-core'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useEffect } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { DraftsProvider, useDraft } from '../drafts/DraftsProvider'
import { ThreadsProvider } from '../threads/ThreadsProvider'
import { useDispatch } from '../threads/useThreads'
import { ThreadConversation } from './ThreadConversation'

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
      identity={{ email: 'a@b.c' }}
      onNeedIdentity={() => {}}
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
    render(
      <ThreadsProvider client={mockClient}>
        <DraftsProvider>
          {/* openId stays null — only the per-id detail cache is seeded. */}
          <Seeder thread={thread} />
          <ThreadConversation
            item={item()}
            client={mockClient}
            identity={{ email: 'a@b.c' }}
            onNeedIdentity={() => {}}
            variant="sidebar"
          />
        </DraftsProvider>
      </ThreadsProvider>,
    )
    expect(await screen.findByText('detail body text')).toBeInTheDocument()
  })
})

describe('ThreadConversation reply focus', () => {
  it('focuses the reply input on mount in the sidebar (Reply/select/cross-page entry)', async () => {
    render(
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
    render(
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
    render(
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
