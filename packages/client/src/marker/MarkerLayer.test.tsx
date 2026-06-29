import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { installObserverSpies, mockRect } from '../../test/test-helpers/dom'
import { WidgetProvider } from '../app/providers'
import { DraftsProvider } from '../drafts/DraftsProvider'
import { IdentityProvider } from '../identity/IdentityProvider'
import { FOCUS_STORAGE_KEY, goToThread } from '../panel/navigate'
import { PanelDrawer } from '../panel/PanelDrawer'
import { PanelProvider } from '../panel/PanelProvider'
import { initSettings, resetSettings } from '../settings/store'
import { ThreadsProvider } from '../threads/ThreadsProvider'
import { ToastProvider } from '../ui/toast'
import { MarkerLayer } from './MarkerLayer'

// MarkerLayer now seeds its pins-hidden state from the shared settings store, which caches its
// first localStorage read. Drop both between cases so the pin-visibility toggle (which writes the
// flag) and the persistence test (which seeds it) can't leak across tests (issue #32).
beforeEach(() => {
  localStorage.clear()
  resetSettings()
})

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
})

const renderMarker = (p: ReturnType<typeof props> & { resolvePageKey?: (url: string) => string }) =>
  render(
    <IdentityProvider
      identity={{ email: 'a@b.c', name: 'A' }}
      requestIdentity={(resume) => resume({ email: 'a@b.c', name: 'A' })}
    >
      <ThreadsProvider client={p.client as never}>
        <PanelProvider client={p.client as never}>
          <DraftsProvider>
            <MarkerLayer {...p} />
          </DraftsProvider>
        </PanelProvider>
      </ThreadsProvider>
    </IdentityProvider>,
  )

describe('MarkerLayer place mode', () => {
  it('enters place mode on + Comment, captures the clicked element, opens a draft, and creates a thread on send', async () => {
    document.body.innerHTML =
      '<main><p id="t" class="lead">target text</p></main><div id="widget"></div>'
    mockRect(document.querySelector('#t') as Element, { left: 0, top: 0, width: 80, height: 16 })
    const c = client()
    renderMarker(props(c))
    fireEvent.click(screen.getByTestId('airside-place'))
    const target = document.querySelector('#t') as Element
    fireEvent.click(target, { clientX: 40, clientY: 8 })
    // A draft popover opens; no thread is created yet.
    expect(await screen.findByTestId('airside-draft')).toBeInTheDocument()
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
    // (DetachedThread may render its banner for pinless threads; check for the toast element specifically.)
    expect(document.querySelector('[data-airside-toast]')).toBeNull()
  })

  it('shows the just-posted comment in the popover immediately, with no extra getThread (BUG A)', async () => {
    document.body.innerHTML =
      '<main><p id="t" class="lead">target text</p></main><div id="widget"></div>'
    mockRect(document.querySelector('#t') as Element, { left: 0, top: 0, width: 80, height: 16 })
    const c = client()
    // Faithful to production (confirmed via the server create-thread use-case + core Thread
    // schema): createThread returns a full Thread whose `comments` array already holds the
    // first comment. The default mock returns comments:[], so override it.
    c.createThread = vi.fn().mockImplementation(async (body: { comment: { text: string } }) => ({
      id: 'new1',
      status: 'open',
      comments: [
        {
          id: 'c-first',
          author: { email: 'a@b.c', name: 'A' },
          text: body.comment.text,
          attachments: [],
          createdAt: new Date().toISOString(),
        },
      ],
    }))
    // Faithful to production: after create, runtime.refresh() re-lists and matches the new
    // thread to the just-clicked DOM node, producing a placement so the ThreadPopover mounts.
    // Reuse the anchor the client captured so the runtime re-matches it to #t.
    c.listThreads = vi.fn().mockImplementation(async () => {
      const created = c.createThread.mock.calls[0]?.[0]
      if (!created) return { threads: [], nextCursor: null }
      return {
        threads: [
          {
            id: 'new1',
            status: 'open',
            anchorState: 'anchored',
            unresolvedCount: 1,
            commentCount: 1,
            createdBy: { email: 'a@b.c', name: 'A' },
            anchor: created.anchor,
          },
        ],
        nextCursor: null,
      }
    })
    renderMarker(props(c))
    fireEvent.click(screen.getByTestId('airside-place'))
    fireEvent.click(document.querySelector('#t') as Element, { clientX: 40, clientY: 8 })
    expect(await screen.findByTestId('airside-draft')).toBeInTheDocument()
    fireEvent.change(screen.getByPlaceholderText(/add a comment/i), {
      target: { value: 'My first note' },
    })
    fireEvent.click(screen.getByRole('button', { name: /send/i }))
    // The comment text must appear immediately in the popover — no manual reload, no refetch.
    await waitFor(() => expect(screen.getByText('My first note')).toBeInTheDocument())
    expect(screen.queryByText(/no comments yet/i)).not.toBeInTheDocument()
    // Seeding from the create response means we must NOT have re-fetched via getThread.
    expect(c.getThread).not.toHaveBeenCalled()
  })

  it('ESC cancels place mode (a subsequent click does not open a draft)', async () => {
    document.body.innerHTML = '<main><p id="t">x</p></main>'
    const c = client()
    renderMarker(props(c))
    fireEvent.click(screen.getByTestId('airside-place'))
    fireEvent.keyDown(document, { key: 'Escape' })
    fireEvent.click(document.querySelector('#t') as Element, { clientX: 1, clientY: 1 })
    expect(screen.queryByTestId('airside-draft')).toBeNull()
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
    fireEvent.click(screen.getByTestId('airside-place'))
    fireEvent.click(document.querySelector('#p') as Element, { clientX: 5, clientY: 5 })
    expect(await screen.findByTestId('airside-draft')).toBeInTheDocument()
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

  it('keeps the pin ✓ after resolve even when a re-emit (mutation/reposition) follows (BUG 2)', async () => {
    document.body.innerHTML = '<main><p id="t" class="lead">resolve target text</p></main>'
    mockRect(document.querySelector('#t') as Element, { left: 0, top: 0, width: 100, height: 20 })
    const spies = installObserverSpies()
    // Real createRuntime: listThreads returns one OPEN thread anchored to #t (status 'open').
    const c = client()
    c.listThreads = vi.fn().mockResolvedValue({
      threads: [
        {
          id: 'th1',
          status: 'open',
          anchorState: 'anchored',
          unresolvedCount: 1,
          commentCount: 1,
          createdBy: { email: 'a@b.c', name: 'Ann' },
          anchor: {
            schemaVersion: 1,
            selectors: ['#t', '#t'],
            signals: {
              tag: 'p',
              classes: ['lead'],
              siblingIndex: 0,
              ancestorTrail: ['main'],
              textSnippet: 'resolve target text',
            },
            offset: { fx: 0.5, fy: 0.5 },
          },
        },
      ],
      nextCursor: null,
    })
    c.getThread = vi.fn().mockResolvedValue({
      id: 'th1',
      status: 'open',
      comments: [
        {
          id: 'c1',
          author: { email: 'a@b.c', name: 'Ann' },
          text: 'the comment',
          attachments: [],
          createdAt: new Date().toISOString(),
        },
      ],
    })
    renderMarker(props(c))
    // Pin renders for the open thread.
    const pin = await screen.findByTestId('airside-pin')
    expect(pin).toHaveAccessibleName(/^Comment thread by/i)
    // Open it and resolve.
    fireEvent.click(pin)
    await waitFor(() => expect(screen.getByText('the comment')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /✓ Resolve/ }))
    await waitFor(() => expect(screen.getByTestId('airside-pin')).toHaveAccessibleName(/resolved/i))
    // Now simulate what the live app does: the popover's own content change is a DOM mutation
    // under document.body → rematchAll() re-emits from the runtime's cached list. Without the
    // runtime status patch, this re-ingest carries stale 'open' and reverts the pin.
    spies.fireMutation()
    // Also exercise reposition (scroll/resize path), which re-emits the cached items too.
    spies.fireResize()
    // The pin must STAY resolved (✓) — no clobber back to the blue "open" avatar.
    await waitFor(() => expect(screen.getByTestId('airside-pin')).toHaveAccessibleName(/resolved/i))
    expect(screen.getByTestId('airside-pin')).toHaveTextContent('✓')
    // listThreads must not have been called again (no refetch; cache patch sufficed).
    expect(c.listThreads).toHaveBeenCalledTimes(1)
    spies.restore()
  })
})

// MarkerLayer owns the Launcher (and its panel button); the drawer is a sibling rendered by
// app.tsx. We render PanelDrawer alongside here so "open the panel" is observable end-to-end.
function renderLayer(client: unknown) {
  return render(
    <WidgetProvider>
      <ToastProvider>
        <IdentityProvider identity={null} requestIdentity={() => {}}>
          <ThreadsProvider client={client as never}>
            <PanelProvider client={client as never}>
              <DraftsProvider>
                <MarkerLayer
                  client={client as never}
                  pageKey="x.test/here"
                  pageUrl="https://x.test/here"
                  resolvePageKey={() => 'x.test/here'}
                />
                <PanelDrawer resolvePageKey={() => 'x.test/here'} client={client as never} />
              </DraftsProvider>
            </PanelProvider>
          </ThreadsProvider>
        </IdentityProvider>
      </ToastProvider>
    </WidgetProvider>,
  )
}

describe('MarkerLayer panel integration', () => {
  beforeEach(() => window.sessionStorage.clear())

  it('opens the panel from the Launcher list button', async () => {
    const client = {
      listThreads: vi.fn(async () => ({ threads: [], nextCursor: null })),
      refreshAnchor: vi.fn(),
      getThread: vi.fn(),
    }
    renderLayer(client)
    screen.getByTestId('airside-panel-open').click()
    await waitFor(() => expect(screen.getByTestId('airside-panel')).toBeInTheDocument())
  })

  it('does not drop a draft when operating the launcher/panel chrome in place mode (#33)', async () => {
    const client = {
      listThreads: vi.fn(async () => ({ threads: [], nextCursor: null })),
      refreshAnchor: vi.fn(),
      getThread: vi.fn(),
    }
    renderLayer(client)
    // Enter place mode via the real place button.
    fireEvent.click(screen.getByTestId('airside-place'))
    expect(screen.getByTestId('airside-place')).toHaveAttribute('aria-pressed', 'true')
    // Clicking the ☰ button opens the sidebar instead of placing a pin.
    fireEvent.click(screen.getByTestId('airside-panel-open'))
    await waitFor(() => expect(screen.getByTestId('airside-panel')).toBeInTheDocument())
    expect(screen.queryByTestId('airside-draft')).toBeNull()
    // Clicking inside the open sidebar interacts with it, doesn't drop a pin.
    fireEvent.click(screen.getByTestId('airside-panel'), { clientX: 5, clientY: 5 })
    expect(screen.queryByTestId('airside-draft')).toBeNull()
    // Clicking the active place button again exits place mode (no pin dropped).
    fireEvent.click(screen.getByTestId('airside-place'))
    expect(screen.getByTestId('airside-place')).toHaveAttribute('aria-pressed', 'false')
    expect(screen.queryByTestId('airside-draft')).toBeNull()
  })

  it('consumes a boot focus handoff after the first refresh', async () => {
    window.sessionStorage.setItem(FOCUS_STORAGE_KEY, 't1')
    const getThread = vi.fn().mockResolvedValue({ id: 't1', status: 'open', comments: [] })
    const client = {
      listThreads: vi.fn(async () => ({ threads: [], nextCursor: null })),
      refreshAnchor: vi.fn(),
      getThread,
    }
    renderLayer(client)
    // boot handoff → controller.requestFocus('t1') → lazy getThread('t1')
    await waitFor(() => expect(getThread).toHaveBeenCalledWith('t1'))
    expect(window.sessionStorage.getItem(FOCUS_STORAGE_KEY)).toBeNull()
  })

  it('opens the panel detail for an openDetail handoff on boot', async () => {
    goToThread(
      { id: 't1', pageUrl: 'https://x.test/here', openDetail: true },
      { storage: window.sessionStorage, assign: () => {} },
    )
    renderLayer(client())
    expect(await screen.findByRole('button', { name: /back/i })).toBeInTheDocument()
  })
})

// One open thread anchored to #t (the "pin target text" paragraph below) so the runtime places it
// and a pin renders — the fixture the visibility toggle acts on.
function clientWithPin() {
  const c = client()
  c.listThreads = vi.fn().mockResolvedValue({
    threads: [
      {
        id: 'th1',
        status: 'open',
        anchorState: 'anchored',
        unresolvedCount: 1,
        commentCount: 1,
        createdBy: { email: 'a@b.c', name: 'Ann' },
        anchor: {
          schemaVersion: 1,
          selectors: ['#t', '#t'],
          signals: {
            tag: 'p',
            classes: ['lead'],
            siblingIndex: 0,
            ancestorTrail: ['main'],
            textSnippet: 'pin target text',
          },
          offset: { fx: 0.5, fy: 0.5 },
        },
      },
    ],
    nextCursor: null,
  })
  return c
}

function seedPinPage() {
  document.body.innerHTML = '<main><p id="t" class="lead">pin target text</p></main>'
  mockRect(document.querySelector('#t') as Element, { left: 0, top: 0, width: 100, height: 20 })
}

describe('MarkerLayer pin-visibility toggle (#32)', () => {
  it('hides the pin on toggle and restores it on a second toggle', async () => {
    seedPinPage()
    renderMarker(props(clientWithPin()))
    expect(await screen.findByTestId('airside-pin')).toBeInTheDocument()
    // Hide: the overlay unmounts, so the pin is gone.
    fireEvent.click(screen.getByTestId('airside-toggle-pins'))
    expect(screen.queryByTestId('airside-pin')).toBeNull()
    // Show: the still-computed placement re-mounts the pin.
    fireEvent.click(screen.getByTestId('airside-toggle-pins'))
    expect(await screen.findByTestId('airside-pin')).toBeInTheDocument()
  })

  it('keeps the sidebar openable while pins are hidden', async () => {
    const c = {
      listThreads: vi.fn(async () => ({ threads: [], nextCursor: null })),
      refreshAnchor: vi.fn(),
      getThread: vi.fn(),
    }
    renderLayer(c)
    fireEvent.click(screen.getByTestId('airside-toggle-pins'))
    // The sidebar is a sibling, never gated by the overlay toggle — it still opens.
    screen.getByTestId('airside-panel-open').click()
    await waitFor(() => expect(screen.getByTestId('airside-panel')).toBeInTheDocument())
  })

  it('mounts with pins hidden when the persisted flag is true, then reveals them on toggle', async () => {
    seedPinPage()
    // Persisted hidden state from a prior session.
    localStorage.setItem('airside:pins-hidden', JSON.stringify(true))
    resetSettings()
    initSettings()
    const c = clientWithPin()
    renderMarker(props(c))
    await waitFor(() => expect(c.listThreads).toHaveBeenCalled())
    // No pin despite a placement existing, because the persisted flag hides the overlay.
    expect(screen.queryByTestId('airside-pin')).toBeNull()
    expect(screen.getByTestId('airside-toggle-pins')).toHaveAttribute('aria-pressed', 'true')
    // Showing pins reveals the placed pin — proving the flag, not the data, hid it.
    fireEvent.click(screen.getByTestId('airside-toggle-pins'))
    expect(await screen.findByTestId('airside-pin')).toBeInTheDocument()
  })

  it('disables placing while hidden so a page click opens no draft', async () => {
    document.body.innerHTML = '<main><p id="t">place target</p></main>'
    renderMarker(props(client()))
    fireEvent.click(screen.getByTestId('airside-toggle-pins'))
    expect(screen.getByTestId('airside-place')).toBeDisabled()
    fireEvent.click(document.querySelector('#t') as Element, { clientX: 1, clientY: 1 })
    expect(screen.queryByTestId('airside-draft')).toBeNull()
  })
})
