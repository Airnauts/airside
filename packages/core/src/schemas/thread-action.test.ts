import { describe, expect, it } from 'vitest'
import { ExtensionSlot, ThreadActionDescriptor } from './thread-action'

describe('ThreadActionDescriptor', () => {
  it('accepts a Jira create descriptor', () => {
    const d = {
      id: 'jira.createIssue',
      provider: 'jira',
      label: 'Create Jira issue',
      slot: 'thread-toolbar',
      presentation: { style: 'primary' },
    }
    expect(ThreadActionDescriptor.parse(d)).toEqual(d)
  })

  it('allows presentation to be omitted', () => {
    expect(() =>
      ThreadActionDescriptor.parse({
        id: 'jira.createIssue',
        provider: 'jira',
        label: 'Create Jira issue',
        slot: 'thread-toolbar',
      }),
    ).not.toThrow()
  })

  it('rejects an unknown slot', () => {
    expect(() => ExtensionSlot.parse('nope')).toThrow()
  })
})
