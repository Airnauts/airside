import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { PinLayer } from './layer'

describe('PinLayer', () => {
  it('renders a pin dot per placement at its document coords', () => {
    render(
      <PinLayer
        placements={[
          { id: 'a', pin: { x: 10, y: 20 }, highlight: [], pending: false },
          {
            id: 'b',
            pin: { x: 30, y: 40 },
            highlight: [{ x: 1, y: 2, width: 5, height: 6 }],
            pending: true,
          },
        ]}
      />,
    )
    const pins = screen.getAllByTestId('comments-pin')
    expect(pins).toHaveLength(2)
    expect(pins[0].style.transform).toContain('translate(10px, 20px)')
  })

  it('renders highlight rects for selection anchors', () => {
    render(
      <PinLayer
        placements={[
          {
            id: 'a',
            pin: { x: 0, y: 0 },
            highlight: [{ x: 1, y: 2, width: 5, height: 6 }],
            pending: false,
          },
        ]}
      />,
    )
    expect(screen.getAllByTestId('comments-highlight')).toHaveLength(1)
  })
})
