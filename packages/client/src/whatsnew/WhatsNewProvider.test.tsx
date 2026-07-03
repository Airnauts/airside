import { fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it } from 'vitest'
import { WidgetProvider } from '../app/providers'
import { IdentityProvider } from '../identity/IdentityProvider'
import type { Identity } from '../identity/storage'
import { resetSettings } from '../settings/store'
import { HIGHLIGHTS } from './highlights'
import { useWhatsNew, WhatsNewProvider } from './WhatsNewProvider'

const SEEN_KEY = 'airside:whats-new-seen'
const LATEST = HIGHLIGHTS[0].version

function Trigger() {
  const { openWhatsNew } = useWhatsNew()
  return (
    <button type="button" onClick={openWhatsNew}>
      show whats new
    </button>
  )
}

function harness(identity: Identity | null): ReactNode {
  return (
    <WidgetProvider>
      <IdentityProvider identity={identity} requestIdentity={() => {}}>
        <WhatsNewProvider>
          <Trigger />
        </WhatsNewProvider>
      </IdentityProvider>
    </WidgetProvider>
  )
}

const reviewer: Identity = { email: 'rev@example.com', name: 'Rev' }

describe('WhatsNewProvider', () => {
  // Standing rule (ADR-0046 read-once cache): seed localStorage, then resetSettings()
  // before mounting so the store re-hydrates the seeded value, not a stale cache.
  beforeEach(() => {
    localStorage.clear()
    resetSettings()
  })

  it('seeds silently on first-ever load: no dialog, setting persisted to latest', () => {
    render(harness(reviewer))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(localStorage.getItem(SEEN_KEY)).toBe(JSON.stringify(LATEST))
  })

  it('auto-shows for an older stored version, then persists latest on close', () => {
    localStorage.setItem(SEEN_KEY, JSON.stringify('0.0.1'))
    resetSettings()
    render(harness(reviewer))

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText(HIGHLIGHTS[0].title)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /got it/i }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(localStorage.getItem(SEEN_KEY)).toBe(JSON.stringify(LATEST))
  })

  it('shows nothing when the stored version equals the latest', () => {
    localStorage.setItem(SEEN_KEY, JSON.stringify(LATEST))
    resetSettings()
    render(harness(reviewer))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('does not auto-show (or seed) while no identity is present', () => {
    localStorage.setItem(SEEN_KEY, JSON.stringify('0.0.1'))
    resetSettings()
    render(harness(null))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(localStorage.getItem(SEEN_KEY)).toBe(JSON.stringify('0.0.1'))
  })

  it('auto-shows once identity appears, and only once', () => {
    localStorage.setItem(SEEN_KEY, JSON.stringify('0.0.1'))
    resetSettings()
    const view = render(harness(null))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    view.rerender(harness(reviewer))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /got it/i }))

    // A later identity change must not re-trigger the auto-show.
    view.rerender(harness({ email: 'other@example.com' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('openWhatsNew() opens the latest entry on demand, even when already seen', () => {
    localStorage.setItem(SEEN_KEY, JSON.stringify(LATEST))
    resetSettings()
    render(harness(reviewer))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'show whats new' }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText(HIGHLIGHTS[0].title)).toBeInTheDocument()
  })
})
