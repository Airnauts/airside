import { describe, expect, it } from 'vitest'
import { buildIssueTitle, buildMarkdownDescription } from './markdown'

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

describe('buildIssueTitle', () => {
  it('prefixes and uses the first comment', () => {
    expect(buildIssueTitle(thread)).toBe('[Page feedback] The header is misaligned on mobile')
  })
  it('truncates long first comments to <= 255 chars total', () => {
    const long = {
      ...thread,
      comments: [{ ...thread.comments[0], text: 'x'.repeat(500) }],
    } as never
    expect(buildIssueTitle(long).length).toBeLessThanOrEqual(255)
  })
})

describe('buildMarkdownDescription', () => {
  it('produces a markdown string with page, comments, attachment and provenance', () => {
    const md = buildMarkdownDescription(thread)
    expect(typeof md).toBe('string')
    expect(md).toContain('https://app.test/about')
    expect(md).toContain('Ann')
    expect(md).toContain('The header is misaligned on mobile')
    expect(md).toContain('https://cdn/x.png') // attachment link
    expect(md).toContain('abc123') // commit sha provenance
  })
})
