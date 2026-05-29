// packages/client/src/ui/Launcher.test.tsx
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Launcher } from './Launcher'

describe('Launcher', () => {
  it('toggles place mode and reflects the active label', () => {
    const onTogglePlace = vi.fn()
    const { rerender } = render(
      <Launcher
        placing={false}
        onTogglePlace={onTogglePlace}
        showResolved={false}
        onShowResolved={() => {}}
        openCount={2}
      />,
    )
    fireEvent.click(screen.getByTestId('comments-place'))
    expect(onTogglePlace).toHaveBeenCalled()
    rerender(
      <Launcher
        placing
        onTogglePlace={onTogglePlace}
        showResolved={false}
        onShowResolved={() => {}}
        openCount={2}
      />,
    )
    expect(screen.getByTestId('comments-place')).toHaveTextContent(/click/i)
  })

  it('toggles show-resolved via a labelled switch', () => {
    const onShowResolved = vi.fn()
    render(
      <Launcher
        placing={false}
        onTogglePlace={() => {}}
        showResolved={false}
        onShowResolved={onShowResolved}
        openCount={0}
      />,
    )
    fireEvent.click(screen.getByRole('switch', { name: /resolved/i }))
    expect(onShowResolved).toHaveBeenCalledWith(true)
  })
})
