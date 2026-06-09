import { describe, expect, it, vi } from 'vitest'
import { runThreadAction } from './run-thread-action'
import { buildExtensionRegistry } from '../extensions/registry'
import { NotFoundError, ConflictError } from '../errors'

function deps(over = {}) {
  const thread = { id: 't1', status: 'open', anchorState: 'anchored', externalLinks: [], comments: [] }
  const repo = {
    getThread: vi.fn().mockResolvedValue(thread),
    upsertExternalLink: vi.fn().mockImplementation((_s, _id, link) =>
      Promise.resolve({ ...thread, externalLinks: [link] }),
    ),
  }
  const link = { provider: 'jira', externalId: '1', key: 'WEB-1', label: 'Jira WEB-1', url: 'https://x.test/1', createdAt: 'now' }
  const registry = buildExtensionRegistry([
    {
      kind: 'thread-action', id: 'jira.createIssue', provider: 'jira',
      label: 'Create Jira issue', slot: 'thread-toolbar',
      visibleWhen: ({ thread }) => !(thread.externalLinks ?? []).some((l) => l.provider === 'jira'),
      run: vi.fn().mockResolvedValue({ externalLink: link }),
    },
  ])
  return { repo, registry, link, ...over }
}

const input = (actionId: string) => ({
  ctx: { projectId: 'p', env: undefined, now: () => new Date('2026-06-09T10:00:00Z') },
  params: { id: 't1', actionId },
  query: undefined,
  body: undefined,
})

describe('runThreadAction', () => {
  it('runs the action, persists the link, returns ThreadView with re-evaluated actions', async () => {
    const d = deps()
    const out = await runThreadAction(input('jira.createIssue') as never, d as never)
    expect(d.repo.upsertExternalLink).toHaveBeenCalledWith(
      { projectId: 'p', env: undefined },
      't1',
      d.link,
      expect.any(String),
    )
    expect(out.actions).toEqual([]) // jira now linked → create action hidden
    expect(out.externalLinks).toEqual([d.link])
  })

  it('404 when the action is not registered', async () => {
    await expect(runThreadAction(input('nope.x') as never, deps() as never)).rejects.toBeInstanceOf(NotFoundError)
  })

  it('404 when the thread does not exist', async () => {
    const d = deps()
    d.repo.getThread = vi.fn().mockResolvedValue(null)
    await expect(runThreadAction(input('jira.createIssue') as never, d as never)).rejects.toBeInstanceOf(NotFoundError)
  })

  it('409 when the action is registered but not visible (already linked)', async () => {
    const d = deps()
    d.repo.getThread = vi.fn().mockResolvedValue({
      id: 't1', status: 'open', anchorState: 'anchored', comments: [],
      externalLinks: [{ provider: 'jira', externalId: 'x', label: 'L', url: 'https://x.test/x', createdAt: 'now' }],
    })
    await expect(runThreadAction(input('jira.createIssue') as never, d as never)).rejects.toBeInstanceOf(ConflictError)
  })

  it('does not persist a link when run returns no externalLink', async () => {
    const d = deps()
    d.registry = buildExtensionRegistry([
      { kind: 'thread-action', id: 'noop', provider: 'x', label: 'N', slot: 'thread-toolbar', run: async () => ({}) },
    ])
    await runThreadAction(input('noop') as never, d as never)
    expect(d.repo.upsertExternalLink).not.toHaveBeenCalled()
  })
})
