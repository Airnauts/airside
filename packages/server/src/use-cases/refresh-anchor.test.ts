import { InMemoryRepository } from '@airnauts/airside-adapter-memory'
import type { ThreadId } from '@airnauts/airside-core'
import { makeNewThread } from '@airnauts/airside-test-support'
import { describe, expect, it, vi } from 'vitest'
import { makeCtx } from '../ctx'
import { NotFoundError } from '../errors'
import { buildExtensionRegistry } from '../extensions/registry'
import { refreshAnchor } from './refresh-anchor'

const ctx = (now: string) => makeCtx({ projectId: 'proj_x', now: () => new Date(now) })
const registry = buildExtensionRegistry([])

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
      { repo, registry },
    )
    expect(out.anchorState).toBe('orphaned')
    expect(out.updatedAt).toBe('2026-06-01T00:00:00.000Z')
    expect(out.actions).toEqual([])
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
        { repo, registry },
      ),
    ).rejects.toBeInstanceOf(NotFoundError)
  })

  it('publishes a thread.updated realtime event when the anchor flips', async () => {
    const repo = new InMemoryRepository()
    const t = await repo.createThread(makeNewThread({ projectId: 'proj_x' }))
    const publish = vi.fn()
    const realtime = { publish, subscribe: vi.fn(() => () => {}) }
    await refreshAnchor(
      {
        ctx: ctx('2026-06-01T00:00:00.000Z'),
        params: { id: t.id },
        query: undefined,
        body: { anchorState: 'orphaned' },
      },
      { repo, registry, realtime },
    )
    expect(publish).toHaveBeenCalledOnce()
    const [, event] = publish.mock.calls[0]!
    expect(event.type).toBe('thread.updated')
    expect(event.threadId).toBe(t.id)
    expect(event.anchorState).toBe('orphaned')
    expect(event.pageKey).toBe(t.pageKey)
  })
})
