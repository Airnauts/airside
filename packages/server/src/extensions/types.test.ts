import { describe, expect, it } from 'vitest'
import type { ServerExtension, ThreadActionResult } from './types'
import { isThreadAction, isNotification } from './types'

describe('extension type guards', () => {
  const action: ServerExtension = {
    kind: 'thread-action',
    id: 'jira.createIssue',
    provider: 'jira',
    label: 'Create Jira issue',
    slot: 'thread-toolbar',
    run: async () => ({}) as ThreadActionResult,
  }
  const notif: ServerExtension = {
    kind: 'notification',
    name: 'slack',
    onEvent: async () => {},
  }

  it('isThreadAction narrows correctly', () => {
    expect(isThreadAction(action)).toBe(true)
    expect(isThreadAction(notif)).toBe(false)
  })
  it('isNotification narrows correctly', () => {
    expect(isNotification(notif)).toBe(true)
    expect(isNotification(action)).toBe(false)
  })
})
