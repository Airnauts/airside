import { expect, it, vi } from 'vitest'
import { type GitHubExtensionOptions, githubExtension } from './index'

const cfg: GitHubExtensionOptions = {
  token: 'ghp_tok',
  owner: 'acme',
  repo: 'web',
  labels: ['airside-feedback'],
}
const thread = {
  id: 't1',
  pageUrl: 'https://app/about',
  pageTitle: 'About',
  status: 'open',
  anchorState: 'anchored',
  externalLinks: [],
  comments: [
    { id: 'c1', author: { email: 'a@b.c' }, text: 'bug', attachments: [], createdAt: 'now' },
  ],
} as never

/** Narrow to the thread-action extension so `visibleWhen`/`run` are callable. */
function firstAction(opts: GitHubExtensionOptions) {
  const [ext] = githubExtension(opts)
  if (ext?.kind !== 'thread-action') throw new Error('expected a thread-action extension')
  return ext
}

it('returns one thread-action extension with the create-issue id', () => {
  const [ext] = githubExtension(cfg)
  expect(ext).toMatchObject({
    kind: 'thread-action',
    id: 'github.createIssue',
    provider: 'github',
    slot: 'thread-toolbar',
  })
})

it('visibleWhen hides the action when a github link already exists', () => {
  const ext = firstAction(cfg)
  expect(ext.visibleWhen?.({ thread, scope: { projectId: 'p', env: undefined } })).toBe(true)
  const linked = { ...thread, externalLinks: [{ provider: 'github' }] }
  expect(ext.visibleWhen?.({ thread: linked, scope: { projectId: 'p', env: undefined } })).toBe(
    false,
  )
})

it('run creates an issue and returns an externalLink', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({
        id: 10042,
        number: 42,
        html_url: 'https://github.com/acme/web/issues/42',
      }),
    }),
  )
  const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
  const ext = firstAction(cfg)
  const result = await ext.run({ thread, scope: { projectId: 'p', env: undefined } })
  expect(result.externalLink).toMatchObject({
    provider: 'github',
    externalId: '10042',
    key: '#42',
    label: 'GitHub #42',
    url: 'https://github.com/acme/web/issues/42',
  })
  expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('#42'))
  logSpy.mockRestore()
})

it('throws at construction when required config is missing', () => {
  expect(() => githubExtension({ ...cfg, token: '' })).toThrow(/token/)
})
