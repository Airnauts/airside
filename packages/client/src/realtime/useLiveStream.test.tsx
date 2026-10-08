import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useLiveStream } from './useLiveStream'

function Harness(props: Parameters<typeof useLiveStream>[0]) {
  useLiveStream(props)
  return null
}

describe('useLiveStream', () => {
  it('does not open a stream when disabled', () => {
    const streamEvents = vi.fn(() => () => {})
    render(<Harness client={{ streamEvents }} enabled={false} onEvent={() => {}} />)
    expect(streamEvents).not.toHaveBeenCalled()
  })

  it('does not open a stream when the client has no streamEvents (graceful fallback)', () => {
    // No streamEvents on the client — older host. Should be a no-op, no throw.
    expect(() => render(<Harness client={{} as never} enabled onEvent={() => {}} />)).not.toThrow()
  })

  it('opens a stream with the pageKey when enabled and tears it down on unmount', () => {
    const unsub = vi.fn()
    const streamEvents = vi.fn(() => unsub)
    const { unmount } = render(
      <Harness client={{ streamEvents }} enabled pageKey="/docs" onEvent={() => {}} />,
    )
    expect(streamEvents).toHaveBeenCalledTimes(1)
    expect(streamEvents.mock.calls[0]![0]).toEqual({ pageKey: '/docs' })
    unmount()
    expect(unsub).toHaveBeenCalled()
  })

  it('forwards events through the latest handler without resubscribing on re-render', () => {
    let handlers: { onEvent: (e: unknown) => void } | null = null
    const streamEvents = vi.fn((_p: unknown, h: { onEvent: (e: unknown) => void }) => {
      handlers = h
      return () => {}
    })
    // Stable client reference (as the real app's useMemo'd client is).
    const client = { streamEvents } as never
    const onEvent = vi.fn()
    const { rerender } = render(<Harness client={client} enabled onEvent={onEvent} />)
    // Re-render with a new closure for onEvent — must NOT resubscribe.
    const onEvent2 = vi.fn()
    rerender(<Harness client={client} enabled onEvent={onEvent2} />)
    expect(streamEvents).toHaveBeenCalledTimes(1)
    handlers!.onEvent({ type: 'x' })
    expect(onEvent).not.toHaveBeenCalled()
    expect(onEvent2).toHaveBeenCalledTimes(1)
  })
})
