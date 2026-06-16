// packages/client/src/ui/Pin.test.tsx
import type { ThreadListItem } from '@airnauts/airside-core'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Pin } from './Pin'

const item = (over: Partial<ThreadListItem> = {}) =>
  ({
    id: 'a',
    status: 'open',
    anchorState: 'anchored',
    // unresolvedCount is a binary thread-status flag (1 when open); the badge must NOT read it.
    unresolvedCount: 1,
    commentCount: 3,
    createdBy: { email: 'a@b.c', name: 'Ann Lee' },
    ...over,
  }) as unknown as ThreadListItem

describe('Pin', () => {
  it('renders initials, the comment count, and an aria-label; click fires onOpen', () => {
    const onOpen = vi.fn()
    render(<Pin item={item()} pin={{ x: 5, y: 6 }} onOpen={onOpen} />)
    const btn = screen.getByRole('button', { name: /Ann Lee/i })
    expect(btn).toHaveTextContent('AL')
    expect(btn).toHaveTextContent('3')
    fireEvent.click(btn)
    expect(onOpen).toHaveBeenCalled()
  })

  it('shows the full comment count, not the binary unresolved flag', () => {
    // Regression: an open thread with many comments reports unresolvedCount: 1 but commentCount: 5.
    render(<Pin item={item({ commentCount: 5 })} pin={{ x: 0, y: 0 }} onOpen={() => {}} />)
    const btn = screen.getByRole('button', { name: /Ann Lee/i })
    expect(btn).toHaveTextContent('5')
    expect(btn).not.toHaveTextContent('1')
  })

  it('resolved pins show a check, not a count, and label as resolved', () => {
    render(<Pin item={item({ status: 'resolved' })} pin={{ x: 0, y: 0 }} onOpen={() => {}} />)
    const btn = screen.getByRole('button', { name: /resolved/i })
    expect(btn).toHaveTextContent('✓')
    expect(btn).not.toHaveTextContent('3')
  })

  it('shows no count pill for a thread with 0 comments', () => {
    render(<Pin item={item({ commentCount: 0 })} pin={{ x: 0, y: 0 }} onOpen={() => {}} />)
    const btn = screen.getByRole('button', { name: /Ann Lee/i })
    expect(btn).not.toHaveTextContent('0')
  })

  it('marks the pin as focused via data-focused', () => {
    const baseItem = {
      id: 't1',
      status: 'open',
      unresolvedCount: 1,
      commentCount: 2,
      createdBy: { email: 'a@b.c', name: 'Ann' },
    } as never
    const { rerender } = render(<Pin item={baseItem} pin={{ x: 0, y: 0 }} focused />)
    expect(screen.getByTestId('airside-pin')).toHaveAttribute('data-focused', 'true')
    rerender(<Pin item={baseItem} pin={{ x: 0, y: 0 }} />)
    expect(screen.getByTestId('airside-pin')).not.toHaveAttribute('data-focused')
  })

  it('marks the pin as active (open or panel-selected) via data-active', () => {
    const { rerender } = render(<Pin item={item()} pin={{ x: 0, y: 0 }} active />)
    expect(screen.getByTestId('airside-pin')).toHaveAttribute('data-active', 'true')
    rerender(<Pin item={item()} pin={{ x: 0, y: 0 }} />)
    expect(screen.getByTestId('airside-pin')).not.toHaveAttribute('data-active')
  })
})
