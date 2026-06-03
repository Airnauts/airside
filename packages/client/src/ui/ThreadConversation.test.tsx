// packages/client/src/ui/ThreadConversation.test.tsx
import type { ThreadListItem } from '@airnauts/comments-core'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { DraftsProvider, useDraft } from '../drafts/DraftsProvider'
import { ThreadsProvider } from '../threads/ThreadsProvider'
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
