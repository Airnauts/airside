import { expect, it, vi } from 'vitest'
import { type JiraExtensionOptions, jiraExtension } from './index'

const cfg: JiraExtensionOptions = {
  siteUrl: 'https://co.atlassian.net',
  email: 'u@co',
  apiToken: 'tok',
  projectKey: 'WEB',
  labels: ['comments-feedback'],
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
function firstAction(opts: JiraExtensionOptions) {
  const [ext] = jiraExtension(opts)
  if (ext?.kind !== 'thread-action') throw new Error('expected a thread-action extension')
  return ext
}

it('returns one thread-action extension with the create-issue id', () => {
  const [ext] = jiraExtension(cfg)
  expect(ext).toMatchObject({
    kind: 'thread-action',
    id: 'jira.createIssue',
    provider: 'jira',
    slot: 'thread-toolbar',
  })
})

it('visibleWhen hides the action when a jira link already exists', () => {
  const ext = firstAction(cfg)
  expect(ext.visibleWhen?.({ thread, scope: { projectId: 'p', env: undefined } })).toBe(true)
  const linked = { ...thread, externalLinks: [{ provider: 'jira' }] }
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
      json: async () => ({ id: '10042', key: 'WEB-123' }),
    }),
  )
  const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
  const ext = firstAction(cfg)
  const result = await ext.run({ thread, scope: { projectId: 'p', env: undefined } })
  expect(result.externalLink).toMatchObject({
    provider: 'jira',
    externalId: '10042',
    key: 'WEB-123',
    label: 'Jira WEB-123',
    url: 'https://co.atlassian.net/browse/WEB-123',
  })
  expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('WEB-123'))
  logSpy.mockRestore()
})

it('throws at construction when required config is missing', () => {
  expect(() => jiraExtension({ ...cfg, apiToken: '' })).toThrow(/apiToken/)
})
