import { describe, expect, it } from 'vitest'
import { toThreadView, toThreadListItemView } from './view'
import { buildExtensionRegistry } from '../extensions/registry'

const scope = { projectId: 'p', env: undefined }
const registry = buildExtensionRegistry([
  {
    kind: 'thread-action', id: 'jira.createIssue', provider: 'jira',
    label: 'Create Jira issue', slot: 'thread-toolbar',
    visibleWhen: ({ thread }) => !(thread.externalLinks ?? []).some((l) => l.provider === 'jira'),
    run: async () => ({}),
  },
])

it('toThreadView embeds evaluated actions', () => {
  const thread = { id: 't1', status: 'open', anchorState: 'anchored', externalLinks: [], comments: [] } as never
  expect(toThreadView(thread, registry, scope).actions.map((a) => a.id)).toEqual(['jira.createIssue'])
})

it('toThreadListItemView embeds evaluated actions', () => {
  const item = { id: 't1', status: 'open', anchorState: 'anchored', externalLinks: [] } as never
  expect(toThreadListItemView(item, registry, scope).actions).toHaveLength(1)
})
