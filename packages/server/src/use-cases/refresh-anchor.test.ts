import type { ThreadId } from '@comments/core'
import { makeNewThread } from '@comments/test-support'
import { describe, expect, it } from 'vitest'
import { makeCtx } from '../ctx'
import { NotFoundError } from '../errors'
import { InMemoryRepository } from '../repository/in-memory'
import { refreshAnchor } from './refresh-anchor'

const ctx = (now: string) => makeCtx({ projectId: 'proj_x', now: () => new Date(now) })

describe('refreshAnchor use-case', () => {
  it('flips anchorState and persists a new fingerprint', async () => {
    const repo = new InMemoryRepository()
    const t = await repo.createThread(makeNewThread({ projectId: 'proj_x' }))
    const out = await refreshAnchor(
      {
        ctx: ctx('2026-06-01T00:00:00.000Z'),
        params: { id: t.id },
        query: undefined,
        body: {
          anchorState: 'orphaned',
          selectors: ['main > h2', '.hero > .subtitle'] as [string, string],
          signals: {
            tag: 'h2',
            classes: ['subtitle'],
            siblingIndex: 1,
            ancestorTrail: ['main', 'section.hero'],
          },
        },
      },
      { repo },
    )
    expect(out.anchorState).toBe('orphaned')
    expect(out.updatedAt).toBe('2026-06-01T00:00:00.000Z')
  })

  it('throws NotFoundError when the thread does not exist', async () => {
    const repo = new InMemoryRepository()
    await expect(
      refreshAnchor(
        {
          ctx: ctx('2026-06-01T00:00:00.000Z'),
          params: { id: 't_missing' as ThreadId },
          query: undefined,
          body: { anchorState: 'anchored' },
        },
        { repo },
      ),
    ).rejects.toBeInstanceOf(NotFoundError)
  })
})
