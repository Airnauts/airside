import { expect, it } from 'vitest'
import { buildExtensionRegistry } from '../extensions/registry'
import { withThreadActions } from './view'

const scope = { projectId: 'p', env: undefined }
const registry = buildExtensionRegistry([
  {
    kind: 'thread-action',
    id: 'jira.createIssue',
    provider: 'jira',
    label: 'Create Jira issue',
    slot: 'thread-toolbar',
    visibleWhen: ({ thread }) => !(thread.externalLinks ?? []).some((l) => l.provider === 'jira'),
    run: async () => ({}),
  },
])

it('withThreadActions embeds evaluated actions on a full thread', () => {
  const thread = {
    id: 't1',
    status: 'open',
    anchorState: 'anchored',
    externalLinks: [],
    comments: [],
  } as never
  expect(withThreadActions(thread, registry, scope).actions.map((a) => a.id)).toEqual([
    'jira.createIssue',
  ])
})

it('withThreadActions embeds evaluated actions on a list item', () => {
  const item = { id: 't1', status: 'open', anchorState: 'anchored', externalLinks: [] } as never
  expect(withThreadActions(item, registry, scope).actions).toHaveLength(1)
})
