// packages/client/src/marker/usePlacingMode.test.tsx
import { fireEvent, render } from '@testing-library/react'
import { useEffect } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Action } from '../threads/state'
import { usePlacingMode } from './usePlacingMode'

/** Renders the hook and immediately enters place mode so the document click guard is armed. */
function Harness({ dispatch }: { dispatch: (a: Action) => void }) {
  const { setPlacing } = usePlacingMode(dispatch)
  useEffect(() => setPlacing(true), [setPlacing])
  return null
}

const setSpy = () => vi.fn() as unknown as (a: Action) => void

describe('usePlacingMode chrome guard', () => {
  afterEach(() => {
    document.body.innerHTML = ''
    vi.restoreAllMocks()
  })

  it('does not place a pin when the click lands on the launcher place button', () => {
    // The launcher is chrome; the place button's attr sits on the <button>, but real clicks
    // land on the inner <span>. The guard must still skip it.
    document.body.innerHTML =
      '<div data-airside-chrome><button data-airside-place><span>✎</span></button></div>'
    const dispatch = setSpy()
    render(<Harness dispatch={dispatch} />)
    fireEvent.click(document.querySelector('span') as Element, { clientX: 5, clientY: 5 })
    expect(dispatch).not.toHaveBeenCalled()
  })

  it('does not place a pin when the click lands inside the panel chrome', () => {
    document.body.innerHTML = '<div data-airside-chrome><p id="row">a thread row</p></div>'
    const dispatch = setSpy()
    render(<Harness dispatch={dispatch} />)
    fireEvent.click(document.querySelector('#row') as Element, { clientX: 5, clientY: 5 })
    expect(dispatch).not.toHaveBeenCalled()
  })

  it('still places a pin for a click on ordinary page content', () => {
    document.body.innerHTML = '<main><p id="t">target</p></main>'
    const dispatch = setSpy()
    render(<Harness dispatch={dispatch} />)
    fireEvent.click(document.querySelector('#t') as Element, { clientX: 5, clientY: 5 })
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'SET_DRAFT' }))
  })
})
