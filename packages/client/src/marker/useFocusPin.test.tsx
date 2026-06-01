// packages/client/src/marker/useFocusPin.test.tsx
import { render } from '@testing-library/react'
import { act, useReducer } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { initialState, reducer } from '../threads/state'
import { useFocusPin } from './useFocusPin'

function Harness(props: Omit<Parameters<typeof useFocusPin>[0], 'getElement'> & { el: Element | null }) {
  const { el, ...rest } = props
  useFocusPin({ ...rest, getElement: () => el })
  return null
}

function StatefulHarness({ placed, el }: { placed: boolean; el: Element | null }) {
  const [state, dispatch] = useReducer(reducer, { ...initialState, pendingFocusId: 't1' })
  useFocusPin({
    pendingFocusId: state.pendingFocusId,
    focusedId: state.focusedId,
    placed,
    getElement: () => el,
    dispatch,
    toast: vi.fn(),
  })
  return <span data-testid="focused">{state.focusedId ?? 'none'}</span>
}

describe('useFocusPin', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('scrolls the element and marks placed when the pin is already placed', () => {
    const scrollIntoView = vi.fn()
    const el = { scrollIntoView } as unknown as Element
    const dispatch = vi.fn()
    render(
      <Harness pendingFocusId="t1" focusedId={null} placed dispatch={dispatch} toast={vi.fn()} el={el} />,
    )
    expect(scrollIntoView).toHaveBeenCalled()
    expect(dispatch).toHaveBeenCalledWith({ type: 'FOCUS_PLACED', id: 't1' })
  })

  it('clears the pulse after the pulse window', () => {
    const dispatch = vi.fn()
    render(
      <Harness
        pendingFocusId={null}
        focusedId="t1"
        placed={false}
        dispatch={dispatch}
        toast={vi.fn()}
        el={null}
      />,
    )
    act(() => vi.advanceTimersByTime(1600))
    expect(dispatch).toHaveBeenCalledWith({ type: 'CLEAR_FOCUS' })
  })

  it('toasts the lost-anchor message and disarms when placement never arrives', () => {
    const dispatch = vi.fn()
    const toast = vi.fn()
    render(
      <Harness
        pendingFocusId="t1"
        focusedId={null}
        placed={false}
        dispatch={dispatch}
        toast={toast}
        el={null}
        timeoutMs={2000}
      />,
    )
    act(() => vi.advanceTimersByTime(2000))
    expect(toast).toHaveBeenCalledWith('This comment’s anchor was lost')
    expect(dispatch).toHaveBeenCalledWith({ type: 'CLEAR_PENDING_FOCUS' })
  })

  it('does nothing when there is no pending focus', () => {
    const dispatch = vi.fn()
    render(
      <Harness pendingFocusId={null} focusedId={null} placed={false} dispatch={dispatch} toast={vi.fn()} el={null} />,
    )
    act(() => vi.advanceTimersByTime(5000))
    expect(dispatch).not.toHaveBeenCalled()
  })

  it('places then clears the pulse via the real reducer (production transition)', () => {
    const el = { scrollIntoView: vi.fn() } as unknown as Element
    const { getByTestId } = render(<StatefulHarness placed el={el} />)
    expect(getByTestId('focused').textContent).toBe('t1') // FOCUS_PLACED set focusedId
    act(() => vi.advanceTimersByTime(1600))
    expect(getByTestId('focused').textContent).toBe('none') // CLEAR_FOCUS fired
  })
})
