// packages/client/src/panel/PanelDrawer.test.tsx
import type { ThreadListItem } from '@airnauts/airside-core'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { act } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { WidgetProvider } from '../app/providers'
import { DraftsProvider } from '../drafts/DraftsProvider'
import { IdentityProvider } from '../identity/IdentityProvider'
import { ThreadsProvider } from '../threads/ThreadsProvider'
import { useController, useDispatch, useThreadsState } from '../threads/useThreads'
import { FOCUS_STORAGE_KEY } from './navigate'
import { PanelDrawer } from './PanelDrawer'
import { PanelProvider, usePanelController } from './PanelProvider'

const item = (over: Partial<ThreadListItem>): ThreadListItem =>
  ({
    id: 'x',
    status: 'open',
    anchorState: 'anchored',
    unresolvedCount: 1,
    commentCount: 1,
    pageUrl: 'https://x.test/pricing',
    pageKey: 'x.test/pricing',
    updatedAt: new Date().toISOString(),
    createdBy: { email: 'a@b.c', name: 'Ann' },
    rootComment: { text: 'root comment', createdAt: new Date().toISOString() },
    ...over,
  }) as ThreadListItem

function Opener() {
  const c = usePanelController()
  return (
    <button type="button" onClick={() => void c.openPanel()}>
      open
    </button>
  )
}

function CloseProbe() {
  const c = usePanelController()
  return (
    <button type="button" onClick={() => void c.closePanel()}>
      close
    </button>
  )
}

function StatusProbe() {
  const threads = useController()
  return (
    <button type="button" onClick={() => void threads.setStatus('a', 'resolved')}>
      resolve
    </button>
  )
}

// Stands in for MarkerLayer.createThread firing the thread-created notification after a save.
function CreateProbe() {
  const threads = useController()
  return (
    <button type="button" onClick={() => threads.notifyThreadCreated()}>
      created
    </button>
  )
}

function DeleteProbe({ id }: { id: string }) {
  const threads = useController()
  return (
    <button type="button" onClick={() => void threads.deleteThread(id)}>
      delete {id}
    </button>
  )
}

// Simulates a cross-page / deep-link open: the thread is NOT in the loaded list, its detail is
// seeded under its own id, and openId stays null. The detail view must fall back to the id-keyed
// detail (not openId) or it renders blank.
function GhostOpener() {
  const panel = usePanelController()
  const dispatch = useDispatch()
  return (
    <button
      type="button"
      onClick={() => {
        dispatch({
          type: 'DETAIL_LOADED',
          id: 'ghost',
          thread: {
            id: 'ghost',
            status: 'open',
            comments: [
              {
                id: 'gc1',
                author: { email: 'a@b.c', name: 'Ann' },
                text: 'ghost detail body',
                attachments: [],
                createdAt: new Date().toISOString(),
              },
            ],
            // biome-ignore lint/suspicious/noExplicitAny: test fixture, partial Thread is enough
          } as any,
        })
        void panel.openPanel()
        panel.openDetail('ghost')
      }}
    >
      ghost
    </button>
  )
}

// Opens a thread's detail directly (no row click, so no requestFocus on this path) — lets a test
// reach the open detail with a clean pendingFocusId, then exercise the page-context card alone.
function DetailOpener({ id }: { id: string }) {
  const panel = usePanelController()
  return (
    <button type="button" onClick={() => panel.openDetail(id)}>
      open detail {id}
    </button>
  )
}

function FocusProbe() {
  const state = useThreadsState()
  return <span data-testid="pending-focus">{state.pendingFocusId ?? 'none'}</span>
}

function setup(opts: {
  threads: ThreadListItem[]
  review?: ThreadListItem[]
  resolvePageKey?: (url: string) => string
  withProbes?: boolean
  detailOpenerId?: string
  deleteProbeId?: string
}) {
  // The main fetch carries `sort: 'updatedAt'`; the review fetch sends only `status`.
  // Distinguish the two by the presence of `sort`.
  const client = {
    listThreads: vi.fn(async (p: { sort?: string; status?: string }) =>
      p.sort
        ? { threads: opts.threads, nextCursor: null }
        : { threads: opts.review ?? [], nextCursor: null },
    ),
    getThread: vi.fn().mockResolvedValue({ id: 'x', status: 'open', comments: [] }),
    setThreadStatus: vi.fn().mockResolvedValue(undefined),
    addComment: vi.fn().mockResolvedValue({
      id: 'c',
      author: { email: 'a@b.c' },
      text: '',
      attachments: [],
      createdAt: new Date().toISOString(),
    }),
    deleteThread: vi.fn().mockResolvedValue({ id: 'x' }),
    upload: vi.fn(),
    createThread: vi.fn(async (body: { comment: { text: string } }) => ({
      id: 'page-new',
      status: 'open',
      anchorState: 'unanchored',
      comments: [
        {
          id: 'pc1',
          author: { email: 'a@b.c', name: 'Ann' },
          text: body.comment.text,
          attachments: [],
          createdAt: new Date().toISOString(),
        },
      ],
    })),
  }
  const resolvePageKey = opts.resolvePageKey ?? (() => 'x.test/other')
  const identity = { email: 'a@b.c', name: 'Ann' }
  render(
    <WidgetProvider>
      <IdentityProvider identity={identity} requestIdentity={(resume) => resume(identity)}>
        <ThreadsProvider client={client as never}>
          <PanelProvider client={client as never}>
            <DraftsProvider>
              <Opener />
              <CloseProbe />
              <GhostOpener />
              {opts.withProbes && <StatusProbe />}
              {opts.withProbes && <CreateProbe />}
              {opts.detailOpenerId && (
                <>
                  <DetailOpener id={opts.detailOpenerId} />
                  <FocusProbe />
                </>
              )}
              {opts.deleteProbeId && <DeleteProbe id={opts.deleteProbeId} />}
              <PanelDrawer resolvePageKey={resolvePageKey} client={client as never} />
            </DraftsProvider>
          </PanelProvider>
        </ThreadsProvider>
      </IdentityProvider>
    </WidgetProvider>,
  )
  return { client }
}

describe('PanelDrawer', () => {
  beforeEach(() => window.sessionStorage.clear())

  it('renders rows once opened and hides the drawer until then', async () => {
    setup({ threads: [item({ id: 'a' }), item({ id: 'b' })] })
    expect(screen.queryByTestId('airside-panel')).not.toBeInTheDocument()
    screen.getByText('open').click()
    await waitFor(() => expect(screen.getAllByTestId('airside-panel-row')).toHaveLength(2))
  })

  it('shows a Needs-review section for open orphans and excludes them from the main list', async () => {
    setup({
      threads: [item({ id: 'a' }), item({ id: 'orph', anchorState: 'orphaned' })],
      review: [item({ id: 'orph', anchorState: 'orphaned' })],
    })
    screen.getByText('open').click()
    await waitFor(() => expect(screen.getByTestId('airside-needs-review')).toBeInTheDocument())
    // 'orph' appears once (in review), 'a' once (in main) → 2 rows total, not 3
    await waitFor(() => expect(screen.getAllByTestId('airside-panel-row')).toHaveLength(2))
  })

  it('cross-page row click stashes the focus id (then navigates)', async () => {
    setup({
      threads: [item({ id: 'a', pageKey: 'x.test/pricing' })],
      resolvePageKey: () => 'x.test/other',
    })
    screen.getByText('open').click()
    await waitFor(() => screen.getByTestId('airside-panel-row'))
    act(() => screen.getByTestId('airside-panel-row').click())
    expect(window.sessionStorage.getItem(FOCUS_STORAGE_KEY)).toBe(
      JSON.stringify({ id: 'a', openDetail: true }),
    )
  })

  it('same-page row click opens the in-sidebar detail (panel stays open, no handoff)', async () => {
    setup({
      threads: [item({ id: 'a', pageKey: 'x.test/here' })],
      resolvePageKey: () => 'x.test/here',
    })
    screen.getByText('open').click()
    await waitFor(() => screen.getByTestId('airside-panel-row'))
    act(() => screen.getByTestId('airside-panel-row').click())
    await waitFor(() => expect(screen.getByRole('button', { name: /back/i })).toBeInTheDocument())
    expect(screen.queryByTestId('airside-panel')).toBeInTheDocument()
    expect(window.sessionStorage.getItem(FOCUS_STORAGE_KEY)).toBeNull()
  })

  it('open detail page-context card re-focuses the pin when the thread is on this page', async () => {
    setup({
      threads: [item({ id: 'a', pageKey: 'x.test/here' })],
      resolvePageKey: () => 'x.test/here',
      detailOpenerId: 'a',
    })
    screen.getByText('open').click()
    await waitFor(() => screen.getByTestId('airside-panel-row'))
    // Open the detail directly (this path does not requestFocus) so pendingFocus starts clean,
    // isolating the card's own re-trigger.
    act(() => screen.getByText('open detail a').click())
    await waitFor(() => screen.getByTestId('airside-detail-page-context'))
    expect(screen.getByTestId('pending-focus')).toHaveTextContent('none')
    act(() => screen.getByTestId('airside-detail-page-context').click())
    // Same page → requestFocus (pulse/scroll the pin), no cross-page handoff.
    expect(screen.getByTestId('pending-focus')).toHaveTextContent('a')
    expect(window.sessionStorage.getItem(FOCUS_STORAGE_KEY)).toBeNull()
  })

  it('open detail page-context card navigates to the thread page when the pin is elsewhere', async () => {
    setup({
      threads: [item({ id: 'a', pageKey: 'x.test/pricing', pageUrl: 'https://x.test/pricing' })],
      resolvePageKey: () => 'x.test/other',
      detailOpenerId: 'a',
    })
    screen.getByText('open').click()
    await waitFor(() => screen.getByTestId('airside-panel-row'))
    act(() => screen.getByText('open detail a').click())
    await waitFor(() => screen.getByTestId('airside-detail-page-context'))
    act(() => screen.getByTestId('airside-detail-page-context').click())
    // Different page → stash the focus handoff and navigate; no in-place focus.
    expect(window.sessionStorage.getItem(FOCUS_STORAGE_KEY)).toBe(
      JSON.stringify({ id: 'a', openDetail: true }),
    )
    expect(screen.getByTestId('pending-focus')).toHaveTextContent('none')
  })

  it('detail view hides the list filters', async () => {
    setup({
      threads: [item({ id: 'a', pageKey: 'x.test/here' })],
      resolvePageKey: () => 'x.test/here',
    })
    screen.getByText('open').click()
    await waitFor(() => screen.getByTestId('airside-panel-row'))
    act(() => screen.getByTestId('airside-panel-row').click())
    await waitFor(() => expect(screen.getByRole('button', { name: /back/i })).toBeInTheDocument())
    expect(screen.queryByRole('button', { name: 'Open' })).not.toBeInTheDocument()
  })

  it('Back returns to the list', async () => {
    setup({
      threads: [item({ id: 'a', pageKey: 'x.test/here' })],
      resolvePageKey: () => 'x.test/here',
    })
    screen.getByText('open').click()
    await waitFor(() => screen.getByTestId('airside-panel-row'))
    act(() => screen.getByTestId('airside-panel-row').click())
    await waitFor(() => screen.getByRole('button', { name: /back/i }))
    act(() => screen.getByRole('button', { name: /back/i }).click())
    await waitFor(() => expect(screen.getByTestId('airside-panel-row')).toBeInTheDocument())
  })

  it('detail view renders comments for a thread not in the list (cross-page fallback, openId null)', async () => {
    setup({ threads: [item({ id: 'a' })] })
    act(() => screen.getByText('ghost').click())
    // Falls back to the id-keyed detail cache; must show the loaded comment, not a blank pane.
    expect(await screen.findByText('ghost detail body')).toBeInTheDocument()
  })

  it('status change while panel is open triggers a refetch; closing removes the listener', async () => {
    const { client } = setup({
      threads: [item({ id: 'a' })],
      withProbes: true,
    })

    // Open the panel and wait for the initial rows to render.
    screen.getByText('open').click()
    await waitFor(() => expect(screen.getAllByTestId('airside-panel-row')).toHaveLength(1))

    // Clear the mock so only calls AFTER this point are counted.
    client.listThreads.mockClear()

    // Fire a status change — setStatus persists then calls the registered statusListener,
    // which calls panel.refresh() → listThreads again.
    act(() => {
      screen.getByText('resolve').click()
    })
    await waitFor(() => expect(client.listThreads).toHaveBeenCalled())

    // Close the panel — the useEffect cleanup deregisters the listener.
    client.listThreads.mockClear()
    act(() => {
      screen.getByText('close').click()
    })
    await waitFor(() => expect(screen.queryByTestId('airside-panel')).not.toBeInTheDocument())

    // Another status change must NOT trigger a refetch since the listener was removed.
    client.listThreads.mockClear()
    act(() => {
      screen.getByText('resolve').click()
    })
    // Give any potential async cascade time to resolve before asserting.
    await new Promise((r) => setTimeout(r, 50))
    expect(client.listThreads).not.toHaveBeenCalled()
  })

  it('thread creation while panel is open triggers a refetch; closing removes the listener', async () => {
    const { client } = setup({
      threads: [item({ id: 'a' })],
      withProbes: true,
    })

    // Open the panel and wait for the initial rows to render.
    screen.getByText('open').click()
    await waitFor(() => expect(screen.getAllByTestId('airside-panel-row')).toHaveLength(1))

    // Clear the mock so only calls AFTER this point are counted.
    client.listThreads.mockClear()

    // Fire a thread-created notification (what MarkerLayer.createThread does after a save) — the
    // registered listener calls panel.refresh() → listThreads again.
    act(() => {
      screen.getByText('created').click()
    })
    await waitFor(() => expect(client.listThreads).toHaveBeenCalled())

    // Close the panel — the useEffect cleanup deregisters the listener.
    client.listThreads.mockClear()
    act(() => {
      screen.getByText('close').click()
    })
    await waitFor(() => expect(screen.queryByTestId('airside-panel')).not.toBeInTheDocument())

    // Another create notification must NOT trigger a refetch since the listener was removed.
    client.listThreads.mockClear()
    act(() => {
      screen.getByText('created').click()
    })
    // Give any potential async cascade time to resolve before asserting.
    await new Promise((r) => setTimeout(r, 50))
    expect(client.listThreads).not.toHaveBeenCalled()
  })

  it('deleting a thread drops its row from the open list without a refetch', async () => {
    const { client } = setup({
      threads: [item({ id: 'a' }), item({ id: 'b' })],
      deleteProbeId: 'a',
    })
    screen.getByText('open').click()
    await waitFor(() => expect(screen.getAllByTestId('airside-panel-row')).toHaveLength(2))

    // Count only calls AFTER the initial load — the drop must be reducer-driven, not a refetch.
    client.listThreads.mockClear()
    act(() => {
      screen.getByText('delete a').click()
    })
    // The deleted row disappears (was stale-until-refresh before this fix).
    await waitFor(() => expect(screen.getAllByTestId('airside-panel-row')).toHaveLength(1))
    expect(client.listThreads).not.toHaveBeenCalled()
  })

  it('deleting the thread whose detail is open returns to the list', async () => {
    setup({
      threads: [item({ id: 'a' }), item({ id: 'b' })],
      detailOpenerId: 'a',
      deleteProbeId: 'a',
    })
    screen.getByText('open').click()
    await waitFor(() => expect(screen.getAllByTestId('airside-panel-row')).toHaveLength(2))

    // Open the deleted thread's detail pane, then delete it.
    act(() => screen.getByText('open detail a').click())
    await waitFor(() => screen.getByRole('button', { name: /back/i }))
    act(() => {
      screen.getByText('delete a').click()
    })

    // The drawer falls back to the list (no dead-end detail pane) and the 'a' row is gone.
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: /back/i })).not.toBeInTheDocument(),
    )
    await waitFor(() => expect(screen.getAllByTestId('airside-panel-row')).toHaveLength(1))
  })

  it('creates a page-level comment (no anchor) from the list and opens its detail', async () => {
    const { client } = setup({ threads: [], resolvePageKey: () => 'x.test/here' })
    screen.getByText('open').click()
    await waitFor(() => expect(screen.getByTestId('airside-panel')).toBeInTheDocument())

    // Reveal the inline composer, type, and send.
    fireEvent.click(screen.getByTestId('airside-page-comment'))
    const input = await screen.findByPlaceholderText(/add a comment/i)
    fireEvent.change(input, { target: { value: 'Feedback about this whole page' } })
    fireEvent.click(screen.getByRole('button', { name: /send/i }))

    await waitFor(() => expect(client.createThread).toHaveBeenCalled())
    const body = client.createThread.mock.calls[0][0]
    expect(body.comment.text).toBe('Feedback about this whole page')
    // The defining trait: a page comment carries no anchor.
    expect(body).not.toHaveProperty('anchor')
    expect(body.pageKey).toBe('x.test/here')

    // On success the new thread's detail opens in the panel (its only surface — no on-page pin).
    await waitFor(() => expect(screen.getByRole('button', { name: /back/i })).toBeInTheDocument())
    expect(screen.getByText('Feedback about this whole page')).toBeInTheDocument()
    // A pinless thread must not offer "return to pin" — that would arm the lost-anchor path for a
    // pin the runtime never places.
    expect(
      screen.queryByRole('button', { name: /scroll to this thread's pin/i }),
    ).not.toBeInTheDocument()
  })

  it('does not badge a page-level (unanchored) thread as "anchor lost"', async () => {
    setup({ threads: [item({ id: 'pg', anchorState: 'unanchored', anchor: undefined })] })
    screen.getByText('open').click()
    await waitFor(() => expect(screen.getByTestId('airside-panel-row')).toBeInTheDocument())
    // The amber "anchor lost" badge is reserved for 'orphaned'; a page comment never shows it.
    expect(screen.queryByText(/anchor lost/i)).not.toBeInTheDocument()
  })
})
