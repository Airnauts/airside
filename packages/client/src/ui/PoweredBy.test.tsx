import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { AIRSIDE_REPO_URL, PoweredBy } from './PoweredBy'

describe('PoweredBy', () => {
  it('links to the Airside repo, opens safely in a new tab, and is named for screen readers', () => {
    render(<PoweredBy />)
    const link = screen.getByRole('link', { name: /powered by airside/i })
    expect(link).toHaveAttribute('href', AIRSIDE_REPO_URL)
    expect(link).toHaveAttribute('target', '_blank')
    expect(link.getAttribute('rel')).toMatch(/noopener/)
    expect(link.getAttribute('rel')).toMatch(/noreferrer/)
  })

  it('marks the decorative wordmark as hidden from assistive tech', () => {
    const { container } = render(<PoweredBy />)
    const svg = container.querySelector('svg')
    expect(svg).not.toBeNull()
    expect(svg).toHaveAttribute('aria-hidden', 'true')
  })
})
