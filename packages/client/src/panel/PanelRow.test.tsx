// packages/client/src/panel/PanelRow.test.tsx
import type { ThreadListItem } from '@airnauts/comments-core'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { PanelRow } from './PanelRow'

const ISO = new Date(Date.now() - 5 * 60_000).toISOString()

const item = (over: Partial<ThreadListItem> = {}): ThreadListItem =>
  ({
    id: 't1',
    status: 'open',
    anchorState: 'anchored',
    unresolvedCount: 1,
    commentCount: 3,
    pageUrl: 'https://x.test/pricing',
    pageTitle: 'Pricing',
    updatedAt: ISO,
    createdBy: { email: 'a@b.c', name: 'Ann' },
    rootComment: { text: 'root msg', createdAt: ISO },
    ...over,
  }) as ThreadListItem

describe('PanelRow', () => {
  it('shows the root comment text, author, page context, and a reply count; row click selects', () => {
    const onSelect = vi.fn()
    render(<PanelRow item={item()} onSelect={onSelect} onReply={() => {}} />)
    expect(screen.getByText('root msg')).toBeInTheDocument()
    expect(screen.getByText('Ann')).toBeInTheDocument()
    expect(screen.getByText('Pricing')).toBeInTheDocument()
    expect(screen.getByText('2 Replies')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('comments-panel-row'))
    expect(onSelect).toHaveBeenCalled()
  })

  it('shows a Reply affordance and calls onReply when there are no replies', () => {
    const onReply = vi.fn()
    render(<PanelRow item={item({ commentCount: 1 })} onSelect={() => {}} onReply={onReply} />)
    fireEvent.click(screen.getByRole('button', { name: 'Reply' }))
    expect(onReply).toHaveBeenCalled()
  })

  it('renders an attachment placeholder when the root text is empty', () => {
    render(
      <PanelRow
        item={item({ commentCount: 1, rootComment: { text: '', createdAt: ISO } })}
        onSelect={() => {}}
        onReply={() => {}}
      />,
    )
    expect(screen.getByText(/attachment/i)).toBeInTheDocument()
  })

  it('falls back to the page url for context when there is no title', () => {
    render(
      <PanelRow item={item({ pageTitle: undefined })} onSelect={() => {}} onReply={() => {}} />,
    )
    expect(screen.getByText('https://x.test/pricing')).toBeInTheDocument()
  })

  it('shows an anchor-lost badge for orphaned threads', () => {
    render(
      <PanelRow item={item({ anchorState: 'orphaned' })} onSelect={() => {}} onReply={() => {}} />,
    )
    expect(screen.getByText(/anchor lost/i)).toBeInTheDocument()
  })

  it('exposes a descriptive aria-label', () => {
    render(<PanelRow item={item()} onSelect={() => {}} onReply={() => {}} />)
    expect(screen.getByTestId('comments-panel-row')).toHaveAccessibleName(/open thread on Pricing/i)
  })
})
