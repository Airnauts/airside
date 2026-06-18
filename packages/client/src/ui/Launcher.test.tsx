// packages/client/src/ui/Launcher.test.tsx
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Launcher } from './Launcher'

const baseProps = {
  placing: false,
  onTogglePlace: () => {},
  openCount: 2,
  panelOpen: false,
  onTogglePanel: () => {},
  pinsHidden: false,
  onTogglePins: () => {},
}

describe('Launcher', () => {
  it('toggles place mode and reflects the active state', () => {
    const onTogglePlace = vi.fn()
    const { rerender } = render(<Launcher {...baseProps} onTogglePlace={onTogglePlace} />)
    const place = screen.getByTestId('airside-place')
    // Icon-only: the open count shows as a badge, not inline text.
    expect(place).toHaveTextContent('2')
    expect(place).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(place)
    expect(onTogglePlace).toHaveBeenCalled()
    rerender(<Launcher {...baseProps} placing onTogglePlace={onTogglePlace} />)
    expect(screen.getByTestId('airside-place')).toHaveAttribute('aria-pressed', 'true')
    // While placing, the badge is hidden in favour of the active-state icon.
    expect(screen.getByTestId('airside-place')).not.toHaveTextContent('2')
  })

  it('toggles the panel via the list button, reflecting open state', () => {
    const onTogglePanel = vi.fn()
    const { rerender } = render(
      <Launcher {...baseProps} openCount={0} onTogglePanel={onTogglePanel} />,
    )
    fireEvent.click(screen.getByRole('button', { name: /open comments panel/i }))
    expect(onTogglePanel).toHaveBeenCalled()
    // When the panel is open the same button is labelled (and announced) as a close affordance.
    rerender(<Launcher {...baseProps} openCount={0} panelOpen onTogglePanel={onTogglePanel} />)
    const toggle = screen.getByRole('button', { name: /close comments panel/i })
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
  })

  it('renders the hide-pins toggle and reflects the hidden state via aria-pressed/label', () => {
    const { rerender } = render(<Launcher {...baseProps} pinsHidden={false} />)
    const toggle = screen.getByTestId('airside-toggle-pins')
    expect(toggle).toHaveAttribute('aria-pressed', 'false')
    expect(toggle).toHaveAccessibleName('Hide pins')
    rerender(<Launcher {...baseProps} pinsHidden />)
    const pressed = screen.getByTestId('airside-toggle-pins')
    expect(pressed).toHaveAttribute('aria-pressed', 'true')
    expect(pressed).toHaveAccessibleName('Show pins')
  })

  it('fires onTogglePins when the toggle is clicked', () => {
    const onTogglePins = vi.fn()
    render(<Launcher {...baseProps} onTogglePins={onTogglePins} />)
    fireEvent.click(screen.getByTestId('airside-toggle-pins'))
    expect(onTogglePins).toHaveBeenCalledTimes(1)
  })

  it('disables the place button while pins are hidden', () => {
    const { rerender } = render(<Launcher {...baseProps} pinsHidden={false} />)
    expect(screen.getByTestId('airside-place')).not.toBeDisabled()
    rerender(<Launcher {...baseProps} pinsHidden />)
    expect(screen.getByTestId('airside-place')).toBeDisabled()
  })
})
