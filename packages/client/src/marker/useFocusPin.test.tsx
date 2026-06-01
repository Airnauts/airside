// packages/client/src/marker/useFocusPin.test.tsx
import { render } from '@testing-library/react'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useFocusPin } from './useFocusPin'

function Harness(props: Omit<Parameters<typeof useFocusPin>[0], 'getElement'> & { el: Element | null }) {
  const { el, ...rest } = props
  useFocusPin({ ...rest, getElement: () => el })
  return null
}

describe('useFocusPin', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('scrolls the element and marks placed when the pin is already placed', () => {
    const scrollIntoView = vi.fn()
    const el = { scrollIntoView } as unknown as Element
    const dispatch = vi.fn()
    render(<Harness pendingFocusId="t1" placed dispatch={dispatch} toast={vi.fn()} el={el} />)
    expect(scrollIntoView).toHaveBeenCalled()
    expect(dispatch).toHaveBeenCalledWith({ type: 'FOCUS_PLACED', id: 't1' })
  })

  it('clears the pulse after the pulse window', () => {
    const dispatch = vi.fn()
    const el = { scrollIntoView: vi.fn() } as unknown as Element
    render(<Harness pendingFocusId="t1" placed dispatch={dispatch} toast={vi.fn()} el={el} />)
    act(() => vi.advanceTimersByTime(1600))
    expect(dispatch).toHaveBeenCalledWith({ type: 'CLEAR_FOCUS' })
  })

  it('toasts the lost-anchor message and disarms when placement never arrives', () => {
    const dispatch = vi.fn()
    const toast = vi.fn()
    render(
      <Harness pendingFocusId="t1" placed={false} dispatch={dispatch} toast={toast} el={null} timeoutMs={2000} />,
    )
    act(() => vi.advanceTimersByTime(2000))
    expect(toast).toHaveBeenCalledWith('This comment’s anchor was lost')
    expect(dispatch).toHaveBeenCalledWith({ type: 'CLEAR_PENDING_FOCUS' })
  })

  it('does nothing when there is no pending focus', () => {
    const dispatch = vi.fn()
    render(<Harness pendingFocusId={null} placed={false} dispatch={dispatch} toast={vi.fn()} el={null} />)
    act(() => vi.advanceTimersByTime(5000))
    expect(dispatch).not.toHaveBeenCalled()
  })
})
