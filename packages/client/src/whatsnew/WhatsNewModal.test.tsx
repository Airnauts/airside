import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { WidgetProvider } from '../app/providers'
import type { Highlight } from './highlights'
import { WhatsNewModal } from './WhatsNewModal'

const ENTRIES: Highlight[] = [
  {
    version: '0.11.0',
    date: '2026-07-10',
    title: 'Faster pins',
    items: ['Pins render twice as fast', 'Smoother drag'],
  },
  {
    version: '0.10.2',
    date: '2026-07-03',
    title: 'Release notes in the widget',
    items: ['A what’s-new popup shows release highlights'],
  },
]

describe('WhatsNewModal', () => {
  it('renders a single entry’s title, version/date and items', () => {
    render(
      <WidgetProvider>
        <WhatsNewModal open onOpenChange={() => {}} entries={[ENTRIES[1]]} />
      </WidgetProvider>,
    )
    expect(screen.getByText('Release notes in the widget')).toBeInTheDocument()
    expect(screen.getByText('0.10.2 · 2026-07-03')).toBeInTheDocument()
    expect(screen.getByText('A what’s-new popup shows release highlights')).toBeInTheDocument()
  })

  it('renders multiple entries stacked in one dialog', () => {
    render(
      <WidgetProvider>
        <WhatsNewModal open onOpenChange={() => {}} entries={ENTRIES} />
      </WidgetProvider>,
    )
    expect(screen.getByText('Faster pins')).toBeInTheDocument()
    expect(screen.getByText('Release notes in the widget')).toBeInTheDocument()
    expect(screen.getByText('Smoother drag')).toBeInTheDocument()
  })

  it('dismisses via the Got it button through onOpenChange(false)', () => {
    const onOpenChange = vi.fn()
    render(
      <WidgetProvider>
        <WhatsNewModal open onOpenChange={onOpenChange} entries={[ENTRIES[0]]} />
      </WidgetProvider>,
    )
    fireEvent.click(screen.getByRole('button', { name: /got it/i }))
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('renders nothing when closed', () => {
    render(
      <WidgetProvider>
        <WhatsNewModal open={false} onOpenChange={() => {}} entries={ENTRIES} />
      </WidgetProvider>,
    )
    expect(screen.queryByText('Faster pins')).not.toBeInTheDocument()
  })
})
