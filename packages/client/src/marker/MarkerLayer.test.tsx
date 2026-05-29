import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ApiClient } from '../api/client'
import { ApiError } from '../api/errors'
import { WidgetProvider } from '../app/providers'
import type { Identity } from '../identity/storage'
import { ToastProvider } from '../ui/toast'
import { MarkerLayer } from './MarkerLayer'

const IDENTITY: Identity = { email: 'rev@example.com' }

function mockClient(over: Partial<ApiClient> = {}): ApiClient {
  return {
    listThreads: vi.fn(async () => ({ threads: [], nextCursor: null })),
    createThread: vi.fn(
      async () => ({ id: 'real-1' }) as Awaited<ReturnType<ApiClient['createThread']>>,
    ),
    getThread: vi.fn(),
    addComment: vi.fn(),
    setThreadStatus: vi.fn(),
    refreshAnchor: vi.fn(),
    upload: vi.fn(),
    ...over,
  } as ApiClient
}

function renderLayer(client: ApiClient, identity: Identity | null, onNeedIdentity = vi.fn()) {
  return render(
    <WidgetProvider>
      <ToastProvider>
        <MarkerLayer
          client={client}
          pageKey="h/p"
          pageUrl="https://h/p"
          identity={identity}
          onNeedIdentity={onNeedIdentity}
        />
      </ToastProvider>
    </WidgetProvider>,
  )
}

describe('MarkerLayer', () => {
  it('optimistically adds a pin and reconciles to the server id on success', async () => {
    let resolveCreate: (t: Awaited<ReturnType<ApiClient['createThread']>>) => void = () => {}
    const created = new Promise<Awaited<ReturnType<ApiClient['createThread']>>>((r) => {
      resolveCreate = r
    })
    const client = mockClient({ createThread: vi.fn(() => created) })
    renderLayer(client, IDENTITY)
    fireEvent.click(screen.getByRole('button', { name: /comment/i }))
    // optimistic (pending) pin appears before the server responds
    expect(await screen.findByTitle(/^optimistic-/)).toBeInTheDocument()
    // resolve the server create -> reconcile
    resolveCreate({ id: 'real-1' } as Awaited<ReturnType<ApiClient['createThread']>>)
    expect(await screen.findByTitle('real-1')).toBeInTheDocument()
    expect(screen.queryByTitle(/^optimistic-/)).toBeNull()
    expect(client.createThread).toHaveBeenCalledOnce()
  })

  it('rolls back the pin and shows a toast on failure', async () => {
    const client = mockClient({
      createThread: vi.fn(async () => {
        throw new ApiError(400, 'VALIDATION_FAILED', 'nope')
      }),
    })
    renderLayer(client, IDENTITY)
    fireEvent.click(screen.getByRole('button', { name: /comment/i }))
    expect(await screen.findByText('nope')).toBeInTheDocument()
    await waitFor(() => expect(document.querySelector('[data-comments-pin]')).toBeNull())
  })

  it('requests identity when none is set', () => {
    const onNeedIdentity = vi.fn()
    renderLayer(mockClient(), null, onNeedIdentity)
    fireEvent.click(screen.getByRole('button', { name: /comment/i }))
    expect(onNeedIdentity).toHaveBeenCalledOnce()
  })
})
