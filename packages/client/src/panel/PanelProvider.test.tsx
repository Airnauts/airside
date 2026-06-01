// packages/client/src/panel/PanelProvider.test.tsx
import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { PanelProvider } from './PanelProvider'
import { usePanelController, usePanelState } from './PanelProvider'

function Probe() {
  const state = usePanelState()
  const controller = usePanelController()
  return (
    <div>
      <button type="button" onClick={() => void controller.openPanel()}>open</button>
      <span data-testid="open">{state.open ? 'yes' : 'no'}</span>
      <span data-testid="count">{state.list.length}</span>
    </div>
  )
}

describe('PanelProvider', () => {
  it('openPanel flips open and loads the list', async () => {
    const listThreads = vi.fn(async () => ({ threads: [{ id: 'a' }], nextCursor: null }))
    render(
      <PanelProvider client={{ listThreads } as never}>
        <Probe />
      </PanelProvider>,
    )
    screen.getByText('open').click()
    await waitFor(() => expect(screen.getByTestId('open').textContent).toBe('yes'))
    await waitFor(() => expect(screen.getByTestId('count').textContent).toBe('1'))
  })

  it('throws when hooks are used outside the provider', () => {
    function Bare() {
      usePanelState()
      return null
    }
    expect(() => render(<Bare />)).toThrow(/PanelProvider/)
  })
})
