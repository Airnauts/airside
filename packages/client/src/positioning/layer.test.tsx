import type { ThreadListItem } from '@airnauts/airside-core'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { DraftsProvider } from '../drafts/DraftsProvider'
import { IdentityProvider } from '../identity/IdentityProvider'
import { PanelProvider } from '../panel/PanelProvider'
import { ThreadsProvider } from '../threads/ThreadsProvider'
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

function mockClient() {
  return {
    getThread: vi.fn().mockResolvedValue({ id: 'a', status: 'open', comments: [] }),
    addComment: vi.fn().mockResolvedValue({}),
    setThreadStatus: vi.fn().mockResolvedValue({}),
    upload: vi.fn().mockResolvedValue({ id: 'at1' }),
    listThreads: vi.fn().mockResolvedValue({ threads: [], nextCursor: null }),
  } as never
}

const renderLayer = (placements: Parameters<typeof PinLayer>[0]['placements']) => {
  const c = mockClient()
  return render(
    <ThreadsProvider client={c}>
      <PanelProvider client={c}>
        <IdentityProvider
          identity={{ email: 'a@b.c', name: 'A' }}
          requestIdentity={(r) => r({ email: 'a@b.c', name: 'A' })}
        >
          <DraftsProvider>
            <PinLayer placements={placements} client={c} />
          </DraftsProvider>
        </IdentityProvider>
      </PanelProvider>
    </ThreadsProvider>,
  )
}

describe('PinLayer', () => {
  it('renders a pin per placement at its document coords (via ThreadPopover trigger)', () => {
    renderLayer([
      { item: item('a'), pin: { x: 10, y: 20 }, highlight: [] },
      {
        item: item('b'),
        pin: { x: 30, y: 40 },
        highlight: [{ x: 1, y: 2, width: 5, height: 6 }],
      },
    ])
    const pins = screen.getAllByTestId('airside-pin')
    expect(pins).toHaveLength(2)
    expect(pins[0].style.transform).toContain('translate(10px, 20px)')
  })

  it('renders highlight rects for selection anchors', () => {
    renderLayer([
      {
        item: item('a'),
        pin: { x: 0, y: 0 },
        highlight: [{ x: 1, y: 2, width: 5, height: 6 }],
      },
    ])
    expect(screen.getAllByTestId('airside-highlight')).toHaveLength(1)
  })
})
