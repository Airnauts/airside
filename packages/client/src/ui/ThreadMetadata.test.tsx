// packages/client/src/ui/ThreadMetadata.test.tsx
import type { ExternalLink } from '@airnauts/airside-core'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ThreadMetadata } from './ThreadMetadata'

const link = (over: Partial<ExternalLink> = {}): ExternalLink => ({
  provider: 'jira',
  externalId: 'PROJ-1',
  key: 'PROJ-1',
  label: 'PROJ-1: Fix the thing',
  url: 'https://example.atlassian.net/browse/PROJ-1',
  createdAt: new Date().toISOString(),
  ...over,
})

describe('ThreadMetadata', () => {
  it('renders an anchor per link with href, label, and safe target attributes', () => {
    render(
      <ThreadMetadata
        links={[
          link(),
          link({
            externalId: 'PROJ-2',
            key: 'PROJ-2',
            label: 'PROJ-2: Another',
            url: 'https://example.atlassian.net/browse/PROJ-2',
          }),
        ]}
      />,
    )
    const first = screen.getByRole('link', { name: 'PROJ-1: Fix the thing' })
    expect(first).toHaveAttribute('href', 'https://example.atlassian.net/browse/PROJ-1')
    expect(first).toHaveAttribute('target', '_blank')
    expect(first).toHaveAttribute('rel', 'noreferrer')
    expect(screen.getByRole('link', { name: 'PROJ-2: Another' })).toBeInTheDocument()
  })

  it('renders nothing for an empty array', () => {
    const { container } = render(<ThreadMetadata links={[]} />)
    expect(container).toBeEmptyDOMElement()
  })
})
