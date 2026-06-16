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
        panelOpen={false}
        onTogglePanel={() => {}}
      />,
    )
    const place = screen.getByTestId('airside-place')
    // Icon-only: the open count shows as a badge, not inline text.
    expect(place).toHaveTextContent('2')
    expect(place).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(place)
    expect(onTogglePlace).toHaveBeenCalled()
    rerender(
      <Launcher
        placing
        onTogglePlace={onTogglePlace}
        openCount={2}
        panelOpen={false}
        onTogglePanel={() => {}}
      />,
    )
    expect(screen.getByTestId('airside-place')).toHaveAttribute('aria-pressed', 'true')
    // While placing, the badge is hidden in favour of the active-state icon.
    expect(screen.getByTestId('airside-place')).not.toHaveTextContent('2')
  })

  it('toggles the panel via the list button, reflecting open state', () => {
    const onTogglePanel = vi.fn()
    const { rerender } = render(
      <Launcher
        placing={false}
        onTogglePlace={() => {}}
        openCount={0}
        panelOpen={false}
        onTogglePanel={onTogglePanel}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /open comments panel/i }))
    expect(onTogglePanel).toHaveBeenCalled()
    // When the panel is open the same button is labelled (and announced) as a close affordance.
    rerender(
      <Launcher
        placing={false}
        onTogglePlace={() => {}}
        openCount={0}
        panelOpen
        onTogglePanel={onTogglePanel}
      />,
    )
    const toggle = screen.getByRole('button', { name: /close comments panel/i })
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
  })
})
