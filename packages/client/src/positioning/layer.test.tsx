import type { ThreadListItem } from '@comments/core'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { PinLayer } from './layer'

const item = (id: string): ThreadListItem =>
  ({
    id,
    status: 'open',
    anchorState: 'anchored',
    unresolvedCount: 0,
    commentCount: 0,
    createdBy: { email: 'a@b.c' },
    anchor: { offset: { fx: 0.5, fy: 0.5 } },
  }) as unknown as ThreadListItem

describe('PinLayer', () => {
  it('renders a pin dot per placement at its document coords', () => {
    render(
      <PinLayer
        placements={[
          { item: item('a'), pin: { x: 10, y: 20 }, highlight: [] },
          {
            item: item('b'),
            pin: { x: 30, y: 40 },
            highlight: [{ x: 1, y: 2, width: 5, height: 6 }],
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
            item: item('a'),
            pin: { x: 0, y: 0 },
            highlight: [{ x: 1, y: 2, width: 5, height: 6 }],
          },
        ]}
      />,
    )
    expect(screen.getAllByTestId('comments-highlight')).toHaveLength(1)
  })
})
