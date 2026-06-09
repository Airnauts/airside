import { describe, expect, it } from 'vitest'
import { ExternalLink } from './external-link'

describe('ExternalLink', () => {
  it('accepts a fully-populated Jira link', () => {
    const link = {
      provider: 'jira',
      externalId: '10042',
      key: 'WEB-123',
      label: 'Jira WEB-123',
      url: 'https://company.atlassian.net/browse/WEB-123',
      createdAt: '2026-06-09T10:00:00.000Z',
    }
    expect(ExternalLink.parse(link)).toEqual(link)
  })

  it('allows optional key and createdBy to be omitted', () => {
    const link = {
      provider: 'custom',
      externalId: 'x1',
      label: 'X 1',
      url: 'https://example.com/x/1',
      createdAt: '2026-06-09T10:00:00.000Z',
    }
    expect(() => ExternalLink.parse(link)).not.toThrow()
  })

  it('rejects a non-URL url', () => {
    expect(() =>
      ExternalLink.parse({
        provider: 'jira',
        externalId: '1',
        label: 'x',
        url: 'not-a-url',
        createdAt: '2026-06-09T10:00:00.000Z',
      }),
    ).toThrow()
  })
})
