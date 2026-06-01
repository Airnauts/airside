// packages/client/src/panel/PanelRow.test.tsx
import type { ThreadListItem } from '@airnauts/comments-core'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { PanelRow } from './PanelRow'

const item = (over: Partial<ThreadListItem> = {}): ThreadListItem =>
  ({
    id: 't1',
    status: 'open',
    anchorState: 'anchored',
    unresolvedCount: 2,
    pageUrl: 'https://x.test/pricing',
    pageTitle: 'Pricing',
    updatedAt: new Date(Date.now() - 5 * 60_000).toISOString(),
    createdBy: { email: 'a@b.c', name: 'Ann' },
    ...over,
  }) as ThreadListItem

describe('PanelRow', () => {
  it('shows page title, unresolved count and relative time, and calls onSelect', () => {
    const onSelect = vi.fn()
    render(<PanelRow item={item()} onSelect={onSelect} />)
    expect(screen.getByText('Pricing')).toBeInTheDocument()
    expect(screen.getByTestId('comments-panel-row')).toHaveTextContent(/2/)
    expect(screen.getByTestId('comments-panel-row')).toHaveTextContent(/5m/)
    fireEvent.click(screen.getByTestId('comments-panel-row'))
    expect(onSelect).toHaveBeenCalled()
  })

  it('falls back to the page url when there is no title', () => {
    render(<PanelRow item={item({ pageTitle: undefined })} onSelect={() => {}} />)
    expect(screen.getByText('https://x.test/pricing')).toBeInTheDocument()
  })

  it('shows an anchor-lost badge for orphaned threads', () => {
    render(<PanelRow item={item({ anchorState: 'orphaned' })} onSelect={() => {}} />)
    expect(screen.getByText(/anchor lost/i)).toBeInTheDocument()
  })

  it('exposes a descriptive aria-label', () => {
    render(
      <PanelRow item={item({ unresolvedCount: 2, pageTitle: 'Pricing' })} onSelect={() => {}} />,
    )
    expect(screen.getByTestId('comments-panel-row')).toHaveAccessibleName(/2 open.*Pricing/i)
  })
})
