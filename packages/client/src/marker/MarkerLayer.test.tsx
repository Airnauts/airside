import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { installObserverSpies, mockRect } from '../../test/test-helpers/dom'
import { MarkerLayer } from './MarkerLayer'

function client() {
  return {
    listThreads: vi.fn().mockResolvedValue({ threads: [], nextCursor: null }),
    createThread: vi.fn().mockResolvedValue({ id: 'new1' }),
    refreshAnchor: vi.fn().mockResolvedValue({}),
  }
}

const props = (c: ReturnType<typeof client>) => ({
  client: c as never,
  pageKey: 'k',
  pageUrl: 'https://x.test/p',
  identity: { email: 'a@b.c', name: 'A' },
  onNeedIdentity: (resume: (i: { email: string; name: string }) => void) =>
    resume({ email: 'a@b.c', name: 'A' }),
})

describe('MarkerLayer place mode', () => {
  it('enters place mode on + Comment, captures the clicked element, creates a thread', async () => {
    document.body.innerHTML =
      '<main><p id="t" class="lead">target text</p></main><div id="widget"></div>'
    mockRect(document.querySelector('#t') as Element, { left: 0, top: 0, width: 80, height: 16 })
    const c = client()
    render(<MarkerLayer {...props(c)} />)
    fireEvent.click(screen.getByTestId('comments-place'))
    const target = document.querySelector('#t') as Element
    fireEvent.click(target, { clientX: 40, clientY: 8 })
    await waitFor(() => expect(c.createThread).toHaveBeenCalled())
    const body = c.createThread.mock.calls[0][0]
    expect(body.anchor.selectors[1]).toBe('#t')
    expect(body.anchor.offset.fx).toBeCloseTo(0.5)
  })

  it('ESC cancels place mode (a subsequent click does not capture)', async () => {
    document.body.innerHTML = '<main><p id="t">x</p></main>'
    const c = client()
    render(<MarkerLayer {...props(c)} />)
    fireEvent.click(screen.getByTestId('comments-place'))
    fireEvent.keyDown(document, { key: 'Escape' })
    fireEvent.click(document.querySelector('#t') as Element, { clientX: 1, clientY: 1 })
    expect(c.createThread).not.toHaveBeenCalled()
  })

  it('captures a text selection when one is active in place mode', async () => {
    document.body.innerHTML = '<main><p id="p">The quick brown fox jumps.</p></main>'
    const tn = document.querySelector('#p')?.firstChild as Text
    const range = document.createRange()
    const s = (tn.textContent ?? '').indexOf('brown fox')
    range.setStart(tn, s)
    range.setEnd(tn, s + 'brown fox'.length)
    // jsdom's Selection is limited; if removeAllRanges/addRange don't reflect in getSelection(),
    // stub window.getSelection for this test to return a selection exposing this range.
    vi.spyOn(window, 'getSelection').mockReturnValue({
      isCollapsed: false,
      rangeCount: 1,
      getRangeAt: () => range,
    } as unknown as Selection)
    const c = client()
    render(<MarkerLayer {...props(c)} />)
    fireEvent.click(screen.getByTestId('comments-place'))
    fireEvent.click(document.querySelector('#p') as Element, { clientX: 5, clientY: 5 })
    await waitFor(() => expect(c.createThread).toHaveBeenCalled())
    expect(c.createThread.mock.calls[0][0].anchor.selection.quote).toBe('brown fox')
    vi.restoreAllMocks()
  })
})

it('re-lists threads when the route changes to a new pageKey', async () => {
  document.body.innerHTML = '<main><p id="t">x</p></main>'
  const c = client()
  render(<MarkerLayer {...props(c)} resolvePageKey={(url) => new URL(url).pathname} />)
  await waitFor(() => expect(c.listThreads).toHaveBeenCalledTimes(1))
  history.pushState({}, '', '/page-b')
  window.dispatchEvent(new PopStateEvent('popstate'))
  await waitFor(() => expect(c.listThreads.mock.calls.length).toBeGreaterThanOrEqual(2))
})

describe('MarkerLayer mutation wiring', () => {
  beforeAll(() => {
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      cb(0)
      return 1
    })
    vi.stubGlobal('cancelAnimationFrame', () => {})
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('DOM mutation triggers rematchAll (not a re-list) and emits without crashing', async () => {
    document.body.innerHTML = '<main><p id="mut">mutation target</p></main>'
    const spies = installObserverSpies()
    const c = client()
    render(<MarkerLayer {...props(c)} />)
    // Wait for the initial refresh (listThreads) to settle
    await waitFor(() => expect(c.listThreads).toHaveBeenCalledTimes(1))
    const listCountBefore = c.listThreads.mock.calls.length
    // Fire a DOM mutation — this should call rematchAll, NOT listThreads again
    spies.fireMutation()
    // listThreads count must not increase — rematchAll does NOT re-list
    expect(c.listThreads.mock.calls.length).toBe(listCountBefore)
    spies.restore()
  })
})
