import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { WidgetErrorBoundary } from './error-boundary'

function Boom(): never {
  throw new Error('kaboom')
}

describe('WidgetErrorBoundary', () => {
  // React logs caught errors to console.error; silence for a clean run.
  beforeEach(() => vi.spyOn(console, 'error').mockImplementation(() => {}))
  afterEach(() => vi.restoreAllMocks())

  it('renders nothing instead of crashing when a child throws', () => {
    render(
      <div>
        <span>host stays</span>
        <WidgetErrorBoundary>
          <Boom />
        </WidgetErrorBoundary>
      </div>,
    )
    // The boundary rendered null; the sibling (host) content is unaffected.
    expect(screen.getByText('host stays')).toBeInTheDocument()
  })
})
