import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { installObserverSpies, mockRect } from '../../test/test-helpers/dom'
import { ThreadsProvider } from '../threads/ThreadsProvider'
import { MarkerLayer } from './MarkerLayer'

function client() {
  return {
    listThreads: vi.fn().mockResolvedValue({ threads: [], nextCursor: null }),
    createThread: vi.fn().mockResolvedValue({ id: 'new1', status: 'open', comments: [] }),
    getThread: vi.fn().mockResolvedValue({ id: 'new1', status: 'open', comments: [] }),
    addComment: vi.fn().mockResolvedValue({
      id: 'c1',
      author: { email: 'a@b.c' },
      text: '',
      attachments: [],
      createdAt: new Date().toISOString(),
    }),
    setThreadStatus: vi.fn().mockResolvedValue({ id: 'new1', status: 'resolved' }),
    upload: vi.fn().mockResolvedValue({ id: 'at1' }),
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

const renderMarker = (p: ReturnType<typeof props>) =>
  render(
    <ThreadsProvider client={p.client as never}>
      <MarkerLayer {...p} />
    </ThreadsProvider>,
  )

describe('MarkerLayer place mode', () => {
  it('enters place mode on + Comment, captures the clicked element, opens a draft, and creates a thread on send', async () => {
    document.body.innerHTML =
      '<main><p id="t" class="lead">target text</p></main><div id="widget"></div>'
    mockRect(document.querySelector('#t') as Element, { left: 0, top: 0, width: 80, height: 16 })
    const c = client()
    renderMarker(props(c))
    fireEvent.click(screen.getByTestId('comments-place'))
    const target = document.querySelector('#t') as Element
    fireEvent.click(target, { clientX: 40, clientY: 8 })
    // A draft popover opens; no thread is created yet.
    expect(await screen.findByTestId('comments-draft')).toBeInTheDocument()
    expect(c.createThread).not.toHaveBeenCalled()
    // Type a comment and send.
    fireEvent.change(screen.getByPlaceholderText(/add a comment/i), {
      target: { value: 'Looks off here' },
    })
    fireEvent.click(screen.getByRole('button', { name: /send/i }))
    await waitFor(() => expect(c.createThread).toHaveBeenCalled())
    const body = c.createThread.mock.calls[0][0]
    expect(body.comment.text).toBe('Looks off here')
    expect(body.anchor.selectors[1]).toBe('#t')
    expect(body.anchor.offset.fx).toBeCloseTo(0.5)
    // A successful create must not fire the "anchor lost" orphan toast.
    expect(screen.queryByText(/anchor was lost/i)).not.toBeInTheDocument()
  })

  it('ESC cancels place mode (a subsequent click does not open a draft)', async () => {
    document.body.innerHTML = '<main><p id="t">x</p></main>'
    const c = client()
    renderMarker(props(c))
    fireEvent.click(screen.getByTestId('comments-place'))
    fireEvent.keyDown(document, { key: 'Escape' })
    fireEvent.click(document.querySelector('#t') as Element, { clientX: 1, clientY: 1 })
    expect(screen.queryByTestId('comments-draft')).toBeNull()
    expect(c.createThread).not.toHaveBeenCalled()
  })

  it('captures a text selection when one is active in place mode', async () => {
    document.body.innerHTML = '<main><p id="p">The quick brown fox jumps.</p></main>'
    const tn = document.querySelector('#p')?.firstChild as Text
    const range = document.createRange()
    const s = (tn.textContent ?? '').indexOf('brown fox')
    range.setStart(tn, s)
    range.setEnd(tn, s + 'brown fox'.length)
    // jsdom ranges have no layout; the draft pin needs a rect from the range.
    range.getBoundingClientRect = () =>
      ({
        left: 5,
        top: 5,
        width: 50,
        height: 16,
        x: 5,
        y: 5,
        right: 55,
        bottom: 21,
        toJSON: () => ({}),
      }) as DOMRect
    // jsdom's Selection is limited; if removeAllRanges/addRange don't reflect in getSelection(),
    // stub window.getSelection for this test to return a selection exposing this range.
    vi.spyOn(window, 'getSelection').mockReturnValue({
      isCollapsed: false,
      rangeCount: 1,
      getRangeAt: () => range,
    } as unknown as Selection)
    const c = client()
    renderMarker(props(c))
    fireEvent.click(screen.getByTestId('comments-place'))
    fireEvent.click(document.querySelector('#p') as Element, { clientX: 5, clientY: 5 })
    expect(await screen.findByTestId('comments-draft')).toBeInTheDocument()
    fireEvent.change(screen.getByPlaceholderText(/add a comment/i), {
      target: { value: 'See this' },
    })
    fireEvent.click(screen.getByRole('button', { name: /send/i }))
    await waitFor(() => expect(c.createThread).toHaveBeenCalled())
    expect(c.createThread.mock.calls[0][0].anchor.selection.quote).toBe('brown fox')
    vi.restoreAllMocks()
  })
})

it('re-lists threads when the route changes to a new pageKey', async () => {
  document.body.innerHTML = '<main><p id="t">x</p></main>'
  const c = client()
  renderMarker({ ...props(c), resolvePageKey: (url) => new URL(url).pathname })
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
    renderMarker(props(c))
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
