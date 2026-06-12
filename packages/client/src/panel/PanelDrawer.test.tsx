// packages/client/src/panel/PanelDrawer.test.tsx
import type { ThreadListItem } from '@airnauts/comments-core'
import { render, screen, waitFor } from '@testing-library/react'
import { act } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { WidgetProvider } from '../app/providers'
import { DraftsProvider } from '../drafts/DraftsProvider'
import { IdentityProvider } from '../identity/IdentityProvider'
import { ThreadsProvider } from '../threads/ThreadsProvider'
import { useController, useDispatch } from '../threads/useThreads'
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

function setup(opts: {
  threads: ThreadListItem[]
  review?: ThreadListItem[]
  resolvePageKey?: (url: string) => string
  withProbes?: boolean
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
    upload: vi.fn(),
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
    expect(screen.queryByTestId('comments-panel')).not.toBeInTheDocument()
    screen.getByText('open').click()
    await waitFor(() => expect(screen.getAllByTestId('comments-panel-row')).toHaveLength(2))
  })

  it('shows a Needs-review section for open orphans and excludes them from the main list', async () => {
    setup({
      threads: [item({ id: 'a' }), item({ id: 'orph', anchorState: 'orphaned' })],
      review: [item({ id: 'orph', anchorState: 'orphaned' })],
    })
    screen.getByText('open').click()
    await waitFor(() => expect(screen.getByTestId('comments-needs-review')).toBeInTheDocument())
    // 'orph' appears once (in review), 'a' once (in main) → 2 rows total, not 3
    await waitFor(() => expect(screen.getAllByTestId('comments-panel-row')).toHaveLength(2))
  })

  it('cross-page row click stashes the focus id (then navigates)', async () => {
    setup({
      threads: [item({ id: 'a', pageKey: 'x.test/pricing' })],
      resolvePageKey: () => 'x.test/other',
    })
    screen.getByText('open').click()
    await waitFor(() => screen.getByTestId('comments-panel-row'))
    act(() => screen.getByTestId('comments-panel-row').click())
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
    await waitFor(() => screen.getByTestId('comments-panel-row'))
    act(() => screen.getByTestId('comments-panel-row').click())
    await waitFor(() => expect(screen.getByRole('button', { name: /back/i })).toBeInTheDocument())
    expect(screen.queryByTestId('comments-panel')).toBeInTheDocument()
    expect(window.sessionStorage.getItem(FOCUS_STORAGE_KEY)).toBeNull()
  })

  it('detail view hides the list filters', async () => {
    setup({
      threads: [item({ id: 'a', pageKey: 'x.test/here' })],
      resolvePageKey: () => 'x.test/here',
    })
    screen.getByText('open').click()
    await waitFor(() => screen.getByTestId('comments-panel-row'))
    act(() => screen.getByTestId('comments-panel-row').click())
    await waitFor(() => expect(screen.getByRole('button', { name: /back/i })).toBeInTheDocument())
    expect(screen.queryByRole('button', { name: 'Open' })).not.toBeInTheDocument()
  })

  it('Back returns to the list', async () => {
    setup({
      threads: [item({ id: 'a', pageKey: 'x.test/here' })],
      resolvePageKey: () => 'x.test/here',
    })
    screen.getByText('open').click()
    await waitFor(() => screen.getByTestId('comments-panel-row'))
    act(() => screen.getByTestId('comments-panel-row').click())
    await waitFor(() => screen.getByRole('button', { name: /back/i }))
    act(() => screen.getByRole('button', { name: /back/i }).click())
    await waitFor(() => expect(screen.getByTestId('comments-panel-row')).toBeInTheDocument())
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
    await waitFor(() => expect(screen.getAllByTestId('comments-panel-row')).toHaveLength(1))

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
    await waitFor(() => expect(screen.queryByTestId('comments-panel')).not.toBeInTheDocument())

    // Another status change must NOT trigger a refetch since the listener was removed.
    client.listThreads.mockClear()
    act(() => {
      screen.getByText('resolve').click()
    })
    // Give any potential async cascade time to resolve before asserting.
    await new Promise((r) => setTimeout(r, 50))
    expect(client.listThreads).not.toHaveBeenCalled()
  })
})
