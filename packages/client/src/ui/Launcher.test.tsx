// packages/client/src/ui/Launcher.test.tsx
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Launcher } from './Launcher'

describe('Launcher', () => {
  it('toggles place mode and reflects the active state', () => {
    const onTogglePlace = vi.fn()
    const { rerender } = render(
      <Launcher
        placing={false}
        onTogglePlace={onTogglePlace}
        openCount={2}
        onTogglePanel={() => {}}
      />,
    )
    const place = screen.getByTestId('comments-place')
    // Icon-only: the open count shows as a badge, not inline text.
    expect(place).toHaveTextContent('2')
    expect(place).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(place)
    expect(onTogglePlace).toHaveBeenCalled()
    rerender(
      <Launcher placing onTogglePlace={onTogglePlace} openCount={2} onTogglePanel={() => {}} />,
    )
    expect(screen.getByTestId('comments-place')).toHaveAttribute('aria-pressed', 'true')
    // While placing, the badge is hidden in favour of the active-state icon.
    expect(screen.getByTestId('comments-place')).not.toHaveTextContent('2')
  })

  it('opens the panel via the list button', () => {
    const onTogglePanel = vi.fn()
    render(
      <Launcher
        placing={false}
        onTogglePlace={() => {}}
        openCount={0}
        onTogglePanel={onTogglePanel}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /comments panel/i }))
    expect(onTogglePanel).toHaveBeenCalled()
  })
})
