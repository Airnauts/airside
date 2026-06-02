import type { ThreadId } from '@airnauts/comments-core'
import { makeNewThread } from '@airnauts/comments-test-support'
import { describe, expect, it } from 'vitest'
import { makeCtx } from '../ctx'
import { NotFoundError } from '../errors'
import { InMemoryRepository } from '@airnauts/comments-adapter-memory'
import { getThread } from './get-thread'

const ctx = makeCtx({ projectId: 'proj_x' })

describe('getThread use-case', () => {
  it('returns the thread when present', async () => {
    const repo = new InMemoryRepository()
    const input = await repo.createThread(makeNewThread({ projectId: 'proj_x' }))
    const out = await getThread(
      { ctx, params: { id: input.id }, query: undefined, body: undefined },
      { repo },
    )
    expect(out.id).toBe(input.id)
  })

  it('throws NotFoundError when missing or out of scope', async () => {
    const repo = new InMemoryRepository()
    await expect(
      getThread(
        { ctx, params: { id: 't_missing' as ThreadId }, query: undefined, body: undefined },
        { repo },
      ),
    ).rejects.toBeInstanceOf(NotFoundError)
  })
})
