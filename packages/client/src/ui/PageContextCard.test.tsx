// packages/client/src/ui/PageContextCard.test.tsx
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { PageContextCard } from './PageContextCard'

describe('PageContextCard', () => {
  it('renders the title and url, and fires onReturnToPin as a button when wired', () => {
    const onReturnToPin = vi.fn()
    render(<PageContextCard pageTitle="Home" pageUrl="https://x/a" onReturnToPin={onReturnToPin} />)
    expect(screen.getByText('Home')).toBeInTheDocument()
    expect(screen.getByText('https://x/a')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /pin/i }))
    expect(onReturnToPin).toHaveBeenCalledTimes(1)
  })

  it('falls back to the url as the title when pageTitle is absent', () => {
    render(<PageContextCard pageUrl="https://x/a" onReturnToPin={() => {}} />)
    // Both the title slot and the url line render the url.
    expect(screen.getAllByText('https://x/a')).toHaveLength(2)
  })

  it('renders a plain label (no button) when onReturnToPin is omitted', () => {
    render(<PageContextCard pageTitle="Home" pageUrl="https://x/a" />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.getByText('Home')).toBeInTheDocument()
  })
})
