import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mockRect } from '../../test/test-helpers/dom'
import type { ApiClient } from '../api/client'
import { WidgetApp } from './app'

const IDENTITY_KEY = 'airside:identity'

// A thread anchored to #t so that, once logged in, the runtime places it and a pin renders.
function clientWithOneThread(): ApiClient {
  return {
    listThreads: vi.fn(async () => ({
      threads: [
        {
          id: 'th1',
          status: 'open',
          anchorState: 'anchored',
          unresolvedCount: 1,
          commentCount: 1,
          createdBy: { email: 'ann@example.com', name: 'Ann' },
          anchor: {
            schemaVersion: 1,
            selectors: ['#t', '#t'],
            signals: {
              tag: 'p',
              classes: ['lead'],
              siblingIndex: 0,
              ancestorTrail: ['main'],
              textSnippet: 'gated target text',
            },
            offset: { fx: 0.5, fy: 0.5 },
          },
        },
      ],
      nextCursor: null,
    })),
    getThread: vi.fn(),
    addComment: vi.fn(),
    createThread: vi.fn(),
    setThreadStatus: vi.fn(),
    refreshAnchor: vi.fn(),
    upload: vi.fn(),
  } as unknown as ApiClient
}

function seedPage() {
  document.body.innerHTML = '<main><p id="t" class="lead">gated target text</p></main>'
  mockRect(document.querySelector('#t') as Element, { left: 0, top: 0, width: 100, height: 20 })
}

describe('login gate', () => {
  beforeEach(() => localStorage.clear())

  it('shows only Log In when logged out — no pins, place, panel, or fetch', async () => {
    seedPage()
    const client = clientWithOneThread()
    render(<WidgetApp options={{ key: 'k', endpoint: 'http://x' }} client={client} />)

    expect(await screen.findByTestId('comments-login')).toBeInTheDocument()
    expect(screen.queryByTestId('airside-place')).not.toBeInTheDocument()
    expect(screen.queryByTestId('airside-panel-open')).not.toBeInTheDocument()
    expect(screen.queryByTestId('airside-pin')).not.toBeInTheDocument()
    expect(client.listThreads).not.toHaveBeenCalled()
  })

  it('logging in unlocks the full UI and loads pins', async () => {
    seedPage()
    const client = clientWithOneThread()
    render(<WidgetApp options={{ key: 'k', endpoint: 'http://x' }} client={client} />)

    fireEvent.click(await screen.findByTestId('comments-login'))
    const dialog = await screen.findByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText('Email'), {
      target: { value: 'rev@example.com' },
    })
    fireEvent.click(within(dialog).getByRole('button', { name: /log in/i }))

    expect(await screen.findByTestId('airside-place')).toBeInTheDocument()
    expect(await screen.findByTestId('airside-pin')).toBeInTheDocument()
    expect(localStorage.getItem(IDENTITY_KEY)).toContain('rev@example.com')
  })

  it('boots straight into the full UI when identity is already stored', async () => {
    localStorage.setItem(IDENTITY_KEY, JSON.stringify({ email: 'known@example.com' }))
    seedPage()
    const client = clientWithOneThread()
    render(<WidgetApp options={{ key: 'k', endpoint: 'http://x' }} client={client} />)

    expect(await screen.findByTestId('airside-place')).toBeInTheDocument()
    expect(screen.queryByTestId('comments-login')).not.toBeInTheDocument()
  })
})
