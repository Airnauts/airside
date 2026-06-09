import { describe, expect, it } from 'vitest'
import { buildAdfDescription, buildSummary } from './adf'

const thread = {
  id: 't1',
  pageUrl: 'https://app.test/about',
  pageTitle: 'About',
  status: 'open',
  anchorState: 'anchored',
  provenance: { branch: 'main', commitSha: 'abc123', deploymentId: 'd1' },
  comments: [
    {
      id: 'c1',
      author: { email: 'a@b.c', name: 'Ann' },
      text: 'The header is misaligned on mobile',
      attachments: [
        { id: 'x', url: 'https://cdn/x.png', name: 'x.png', contentType: 'image/png', size: 1 },
      ],
      createdAt: '2026-06-09T10:00:00.000Z',
    },
    {
      id: 'c2',
      author: { email: 'b@b.c' },
      text: 'Agreed',
      attachments: [],
      createdAt: '2026-06-09T11:00:00.000Z',
      editedAt: '2026-06-09T11:05:00.000Z',
    },
  ],
} as never

describe('buildSummary', () => {
  it('prefixes and uses the first comment', () => {
    expect(buildSummary(thread)).toBe('[Page feedback] The header is misaligned on mobile')
  })
  it('truncates long first comments to <= 255 chars total', () => {
    const long = {
      ...thread,
      comments: [{ ...thread.comments[0], text: 'x'.repeat(500) }],
    } as never
    expect(buildSummary(long).length).toBeLessThanOrEqual(255)
  })
})

describe('buildAdfDescription', () => {
  it('produces ADF doc v1 with page, thread meta, comments, provenance', () => {
    const doc = buildAdfDescription(thread)
    expect(doc).toMatchObject({ type: 'doc', version: 1 })
    const text = JSON.stringify(doc)
    expect(text).toContain('https://app.test/about')
    expect(text).toContain('Ann')
    expect(text).toContain('The header is misaligned on mobile')
    expect(text).toContain('abc123') // commit sha provenance
    expect(text).toContain('https://cdn/x.png') // attachment link
  })
})
