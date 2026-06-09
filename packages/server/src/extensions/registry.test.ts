import { describe, expect, it } from 'vitest'
import { buildExtensionRegistry } from './registry'
import type { ServerExtension } from './types'

const scope = { projectId: 'p', env: undefined }
const thread = { id: 't1', status: 'open', anchorState: 'anchored', externalLinks: [] } as never

function jiraAction(): ServerExtension {
  return {
    kind: 'thread-action',
    id: 'jira.createIssue',
    provider: 'jira',
    label: 'Create Jira issue',
    slot: 'thread-toolbar',
    visibleWhen: ({ thread }) => !(thread.externalLinks ?? []).some((l) => l.provider === 'jira'),
    run: async () => ({}),
  }
}

describe('buildExtensionRegistry', () => {
  it('separates notification and action extensions', () => {
    const reg = buildExtensionRegistry([
      { kind: 'notification', name: 'slack', onEvent: async () => {} },
      jiraAction(),
    ])
    expect(reg.notifications).toHaveLength(1)
    expect(reg.getAction('jira.createIssue')).toBeDefined()
    expect(reg.getAction('nope')).toBeUndefined()
  })

  it('evaluateDescriptors returns only visible actions', () => {
    const reg = buildExtensionRegistry([jiraAction()])
    const visible = reg.evaluateDescriptors({ thread, scope })
    expect(visible.map((d) => d.id)).toEqual(['jira.createIssue'])
  })

  it('hides an action whose visibleWhen is false (jira already linked)', () => {
    const reg = buildExtensionRegistry([jiraAction()])
    const linked = { ...thread, externalLinks: [{ provider: 'jira' }] } as never
    expect(reg.evaluateDescriptors({ thread: linked, scope })).toEqual([])
  })

  it('rejects duplicate action ids at construction', () => {
    expect(() => buildExtensionRegistry([jiraAction(), jiraAction()])).toThrow(/duplicate/i)
  })
})
