// packages/client/src/panel/PanelRow.test.tsx
import type { ThreadListItem } from '@airnauts/airside-core'
import { act, fireEvent, render, screen } from '@testing-library/react'
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
    render(<PanelRow item={item()} onSelect={onSelect} onReply={() => {}} onResolve={() => {}} />)
    expect(screen.getByText('root msg')).toBeInTheDocument()
    expect(screen.getByText('Ann')).toBeInTheDocument()
    expect(screen.getByText('Pricing')).toBeInTheDocument()
    expect(screen.getByText('2 Replies')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('airside-panel-row'))
    expect(onSelect).toHaveBeenCalled()
  })

  it('shows a Reply affordance and calls onReply when there are no replies', () => {
    const onReply = vi.fn()
    render(
      <PanelRow
        item={item({ commentCount: 1 })}
        onSelect={() => {}}
        onReply={onReply}
        onResolve={() => {}}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Reply' }))
    expect(onReply).toHaveBeenCalled()
  })

  it('renders an attachment placeholder when the root text is empty', () => {
    render(
      <PanelRow
        item={item({ commentCount: 1, rootComment: { text: '', createdAt: ISO } })}
        onSelect={() => {}}
        onReply={() => {}}
        onResolve={() => {}}
      />,
    )
    expect(screen.getByText(/attachment/i)).toBeInTheDocument()
  })

  it('falls back to the page url for context when there is no title', () => {
    render(
      <PanelRow
        item={item({ pageTitle: undefined })}
        onSelect={() => {}}
        onReply={() => {}}
        onResolve={() => {}}
      />,
    )
    expect(screen.getByText('https://x.test/pricing')).toBeInTheDocument()
  })

  it('shows an anchor-lost badge for orphaned threads', () => {
    render(
      <PanelRow
        item={item({ anchorState: 'orphaned' })}
        onSelect={() => {}}
        onReply={() => {}}
        onResolve={() => {}}
      />,
    )
    expect(screen.getByText(/anchor lost/i)).toBeInTheDocument()
  })

  it('exposes a descriptive aria-label', () => {
    render(<PanelRow item={item()} onSelect={() => {}} onReply={() => {}} onResolve={() => {}} />)
    expect(screen.getByTestId('airside-panel-row')).toHaveAccessibleName(/open thread on Pricing/i)
  })

  it('calls onResolve when the resolve button is clicked', () => {
    const onResolve = vi.fn()
    render(
      <PanelRow
        item={item({ status: 'open' })}
        onSelect={() => {}}
        onReply={() => {}}
        onResolve={onResolve}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /resolve/i }))
    expect(onResolve).toHaveBeenCalled()
  })

  it('copies a deep link when Copy link is clicked', () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, { clipboard: { writeText } })
    render(
      <PanelRow
        item={item({ id: 't42', pageUrl: 'https://site.com/a', pageTitle: undefined })}
        onSelect={() => {}}
        onReply={() => {}}
        onResolve={() => {}}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /copy link/i }))
    expect(writeText).toHaveBeenCalledWith('https://site.com/a?airside-thread=t42')
  })

  it('flips the label to "Copied!" briefly after copying, then back', () => {
    vi.useFakeTimers()
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } })
    render(<PanelRow item={item()} onSelect={() => {}} onReply={() => {}} onResolve={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /copy link/i }))
    expect(screen.getByText('Copied!')).toBeInTheDocument()
    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(screen.getByText('Copy link')).toBeInTheDocument()
    vi.useRealTimers()
  })
})
