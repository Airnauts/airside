// packages/client/src/ui/Pin.test.tsx
import type { ThreadListItem } from '@comments/core'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Pin } from './Pin'

const item = (over: Partial<ThreadListItem> = {}) =>
  ({
    id: 'a',
    status: 'open',
    anchorState: 'anchored',
    unresolvedCount: 3,
    commentCount: 3,
    createdBy: { email: 'a@b.c', name: 'Ann Lee' },
    ...over,
  }) as unknown as ThreadListItem

describe('Pin', () => {
  it('renders initials, an unresolved count, and an aria-label; click fires onOpen', () => {
    const onOpen = vi.fn()
    render(<Pin item={item()} pin={{ x: 5, y: 6 }} onOpen={onOpen} />)
    const btn = screen.getByRole('button', { name: /Ann Lee/i })
    expect(btn).toHaveTextContent('AL')
    expect(btn).toHaveTextContent('3')
    fireEvent.click(btn)
    expect(onOpen).toHaveBeenCalled()
  })

  it('resolved pins show a check, not a count, and label as resolved', () => {
    render(
      <Pin
        item={item({ status: 'resolved', unresolvedCount: 0 })}
        pin={{ x: 0, y: 0 }}
        onOpen={() => {}}
      />,
    )
    const btn = screen.getByRole('button', { name: /resolved/i })
    expect(btn).toHaveTextContent('✓')
  })
})
