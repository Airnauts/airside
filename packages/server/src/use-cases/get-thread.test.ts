import { InMemoryRepository } from '@airnauts/airside-adapter-memory'
import type { ThreadId } from '@airnauts/airside-core'
import { makeNewThread } from '@airnauts/airside-test-support'
import { describe, expect, it } from 'vitest'
import { makeCtx } from '../ctx'
import { NotFoundError } from '../errors'
import { buildExtensionRegistry } from '../extensions/registry'
import type { ThreadActionExtension } from '../extensions/types'
import { getThread } from './get-thread'

const ctx = makeCtx({ projectId: 'proj_x' })
const registry = buildExtensionRegistry([])

describe('getThread use-case', () => {
  it('returns the thread when present, with an actions array', async () => {
    const repo = new InMemoryRepository()
    const input = await repo.createThread(makeNewThread({ projectId: 'proj_x' }))
    const out = await getThread(
      { ctx, params: { id: input.id }, query: undefined, body: undefined },
      { repo, registry },
    )
    expect(out.id).toBe(input.id)
    expect(out.actions).toEqual([])
  })

  it('throws NotFoundError when missing or out of scope', async () => {
    const repo = new InMemoryRepository()
    await expect(
      getThread(
        { ctx, params: { id: 't_missing' as ThreadId }, query: undefined, body: undefined },
        { repo, registry },
      ),
    ).rejects.toBeInstanceOf(NotFoundError)
  })

  it('embeds visible action descriptors (jira create-issue when no jira link)', async () => {
    const repo = new InMemoryRepository()
    const input = await repo.createThread(makeNewThread({ projectId: 'proj_x' }))
    const jiraCreateIssue: ThreadActionExtension = {
      kind: 'thread-action',
      id: 'jira.createIssue',
      provider: 'jira',
      label: 'Create Jira issue',
      slot: 'thread-toolbar',
      visibleWhen: ({ thread }) => !(thread.externalLinks ?? []).some((l) => l.provider === 'jira'),
      run: async () => ({}),
    }
    const out = await getThread(
      { ctx, params: { id: input.id }, query: undefined, body: undefined },
      { repo, registry: buildExtensionRegistry([jiraCreateIssue]) },
    )
    expect(out.actions.some((a) => a.id === 'jira.createIssue')).toBe(true)
  })
})
